export type ReportTone = "neutral" | "buyer-friendly" | "risk-focused";

export type FactPolarity = "positive" | "negative" | "neutral";

export type FactSeverity = "low" | "medium" | "high";

export type FactValue = string | number | boolean | null | undefined;

export interface GroundingSource {
  id: string;
  label?: string;
  url?: string;
  observedAt?: string;
}

export interface ScoreFact {
  id: string;
  label: string;
  value: number;
  unit?: string;
  max?: number;
  polarity?: FactPolarity;
  severity?: FactSeverity;
  reason?: string;
  sourceIds?: string[];
}

export interface DataFact {
  id: string;
  label: string;
  value?: FactValue;
  valueText?: string;
  polarity?: FactPolarity;
  severity?: FactSeverity;
  reason?: string;
  required?: boolean;
  sourceIds?: string[];
}

export interface ReportInput {
  propertyLabel?: string;
  overallScore?: ScoreFact;
  scores?: ScoreFact[];
  facts?: DataFact[];
  sources?: GroundingSource[];
}

export interface GroundedReportItem {
  text: string;
  factIds: string[];
  sourceIds: string[];
}

export interface GroundedReport {
  summary: string;
  pros: GroundedReportItem[];
  cons: GroundedReportItem[];
  caveats: GroundedReportItem[];
  groundedFactIds: string[];
  usedDeterministicFallback: boolean;
}

export interface ReportOptions {
  maxPros?: number;
  maxCons?: number;
  maxCaveats?: number;
  tone?: ReportTone;
}

export interface ReportNarrativeProvider {
  generate(input: ReportInput, draft: GroundedReport): Promise<GroundedReport>;
}

const DEFAULT_OPTIONS: Required<ReportOptions> = {
  maxPros: 5,
  maxCons: 5,
  maxCaveats: 5,
  tone: "neutral",
};

export function buildGroundedReport(
  input: ReportInput,
  options: ReportOptions = {},
): GroundedReport {
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  const scores = input.scores ?? [];
  const facts = input.facts ?? [];
  const allFacts = [
    ...(input.overallScore ? [input.overallScore] : []),
    ...scores,
    ...facts,
  ];

  const pros = [
    ...scores.filter((fact) => classifyScore(fact) === "positive").map(scoreToItem),
    ...facts
      .filter((fact) => classifyDataFact(fact) === "positive")
      .map(dataFactToItem),
  ].slice(0, resolved.maxPros);

  const cons = [
    ...scores.filter((fact) => classifyScore(fact) === "negative").map(scoreToItem),
    ...facts
      .filter((fact) => classifyDataFact(fact) === "negative")
      .map(dataFactToItem),
  ].slice(0, resolved.maxCons);

  const missingCaveats = facts
    .filter((fact) => fact.required && isMissing(fact))
    .map((fact) => missingFactToCaveat(fact));

  const neutralCaveats = [
    ...(input.overallScore && classifyScore(input.overallScore) === "neutral"
      ? [scoreToCaveat(input.overallScore)]
      : []),
    ...scores.filter((fact) => classifyScore(fact) === "neutral").map(scoreToCaveat),
    ...facts
      .filter((fact) => classifyDataFact(fact) === "neutral" && !isMissing(fact))
      .map(dataFactToCaveat),
  ];

  const caveats = [...missingCaveats, ...neutralCaveats].slice(0, resolved.maxCaveats);

  return {
    summary: buildSummary(input, pros, cons, caveats, resolved.tone),
    pros,
    cons,
    caveats,
    groundedFactIds: allFacts.map((fact) => fact.id),
    usedDeterministicFallback: true,
  };
}

export async function generateGroundedReport(
  input: ReportInput,
  options: ReportOptions = {},
  narrativeProvider?: ReportNarrativeProvider,
): Promise<GroundedReport> {
  const draft = buildGroundedReport(input, options);

  if (!narrativeProvider) {
    return draft;
  }

  const generated = await narrativeProvider.generate(input, draft);
  const violations = validateReportGrounding(input, generated);

  return violations.length === 0 ? generated : {
    ...draft,
    caveats: [
      ...draft.caveats,
      {
        text: "Generated narrative was not used because it was not fully grounded in the provided data.",
        factIds: [],
        sourceIds: [],
      },
    ],
  };
}

export function validateReportGrounding(
  input: ReportInput,
  report: GroundedReport,
): string[] {
  const allowedFactIds = new Set(getFactIds(input));
  const allowedSourceIds = new Set([
    ...(input.sources ?? []).map((source) => source.id),
    ...getSourceIds(input),
  ]);
  const violations: string[] = [];

  for (const factId of report.groundedFactIds) {
    if (!allowedFactIds.has(factId)) {
      violations.push(`Unknown grounded fact id: ${factId}`);
    }
  }

  for (const item of [...report.pros, ...report.cons, ...report.caveats]) {
    if (item.factIds.length === 0) {
      violations.push(`Ungrounded report item: ${item.text}`);
    }

    for (const factId of item.factIds) {
      if (!allowedFactIds.has(factId)) {
        violations.push(`Unknown fact id: ${factId}`);
      }
    }

    for (const sourceId of item.sourceIds) {
      if (!allowedSourceIds.has(sourceId)) {
        violations.push(`Unknown source id: ${sourceId}`);
      }
    }
  }

  return violations;
}

function buildSummary(
  input: ReportInput,
  pros: GroundedReportItem[],
  cons: GroundedReportItem[],
  caveats: GroundedReportItem[],
  tone: ReportTone,
): string {
  const subject = input.propertyLabel?.trim() || "This property";
  const scoreClause = input.overallScore
    ? ` has an overall score of ${formatScore(input.overallScore)}`
    : " has no overall score yet";

  const balance = describeBalance(pros.length, cons.length, caveats.length, tone);
  return `${subject}${scoreClause}. ${balance}`;
}

function describeBalance(
  proCount: number,
  conCount: number,
  caveatCount: number,
  tone: ReportTone,
): string {
  if (proCount === 0 && conCount === 0) {
    return caveatCount > 0
      ? "The available information is limited, so review the caveats before making a decision."
      : "There is not enough grounded information to call out clear strengths or risks.";
  }

  if (conCount > proCount) {
    return tone === "buyer-friendly"
      ? "The report shows some strengths, but the known risks need closer review."
      : "The known risks outweigh the listed strengths based on the provided facts.";
  }

  if (proCount > conCount) {
    return tone === "risk-focused"
      ? "The report shows more strengths than risks, while still leaving room for due diligence."
      : "The listed strengths outweigh the known risks based on the provided facts.";
  }

  return "The listed strengths and risks are balanced based on the provided facts.";
}

function classifyScore(fact: ScoreFact): FactPolarity {
  if (fact.polarity) {
    return fact.polarity;
  }

  const max = fact.max ?? 100;
  const ratio = max === 0 ? 0 : fact.value / max;
  if (ratio >= 0.7) {
    return "positive";
  }
  if (ratio <= 0.4) {
    return "negative";
  }
  return "neutral";
}

function classifyDataFact(fact: DataFact): FactPolarity {
  if (isMissing(fact)) {
    return "neutral";
  }

  return fact.polarity ?? "neutral";
}

function scoreToItem(fact: ScoreFact): GroundedReportItem {
  const reason = fact.reason ? `: ${fact.reason}` : "";
  return {
    text: `${fact.label} is ${formatScore(fact)}${reason}.`,
    factIds: [fact.id],
    sourceIds: fact.sourceIds ?? [],
  };
}

function dataFactToItem(fact: DataFact): GroundedReportItem {
  const value = formatDataValue(fact);
  const reason = fact.reason ? `: ${fact.reason}` : "";
  return {
    text: value ? `${fact.label} is ${value}${reason}.` : `${fact.label}${reason}.`,
    factIds: [fact.id],
    sourceIds: fact.sourceIds ?? [],
  };
}

function scoreToCaveat(fact: ScoreFact): GroundedReportItem {
  const reason = fact.reason ? ` ${fact.reason}` : "";
  return {
    text: `${fact.label} is ${formatScore(fact)}, which is not clearly positive or negative.${reason}`,
    factIds: [fact.id],
    sourceIds: fact.sourceIds ?? [],
  };
}

function dataFactToCaveat(fact: DataFact): GroundedReportItem {
  const value = formatDataValue(fact);
  const reason = fact.reason ? ` ${fact.reason}` : "";
  return {
    text: value
      ? `${fact.label} is ${value}, but it is not clearly positive or negative.${reason}`
      : `${fact.label} is available, but it is not clearly positive or negative.${reason}`,
    factIds: [fact.id],
    sourceIds: fact.sourceIds ?? [],
  };
}

function missingFactToCaveat(fact: DataFact): GroundedReportItem {
  return {
    text: `${fact.label} is missing, so this report should not treat it as known.`,
    factIds: [fact.id],
    sourceIds: fact.sourceIds ?? [],
  };
}

function formatScore(fact: ScoreFact): string {
  const max = fact.max !== undefined ? `/${fact.max}` : "";
  const unit = fact.unit ? ` ${fact.unit}` : "";
  return `${fact.value}${max}${unit}`;
}

function formatDataValue(fact: DataFact): string {
  if (fact.valueText) {
    return fact.valueText;
  }

  if (typeof fact.value === "boolean") {
    return fact.value ? "yes" : "no";
  }

  if (fact.value === null || fact.value === undefined || fact.value === "") {
    return "";
  }

  return String(fact.value);
}

function isMissing(fact: DataFact): boolean {
  const hasValueText = fact.valueText !== undefined && fact.valueText !== "";
  const hasValue = fact.value !== null && fact.value !== undefined && fact.value !== "";
  return !hasValueText && !hasValue;
}

function getFactIds(input: ReportInput): string[] {
  return [
    ...(input.overallScore ? [input.overallScore.id] : []),
    ...(input.scores ?? []).map((fact) => fact.id),
    ...(input.facts ?? []).map((fact) => fact.id),
  ];
}

function getSourceIds(input: ReportInput): string[] {
  return [
    ...(input.overallScore?.sourceIds ?? []),
    ...(input.scores ?? []).flatMap((fact) => fact.sourceIds ?? []),
    ...(input.facts ?? []).flatMap((fact) => fact.sourceIds ?? []),
  ];
}
