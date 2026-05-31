export type Verdict = "yes" | "maybe" | "no";

export type RiskSeverity = "low" | "medium" | "high" | "severe";

export interface MonthlyOperatingCosts {
  mortgage?: number;
  propertyTax?: number;
  insurance?: number;
  hoa?: number;
  maintenance?: number;
  vacancy?: number;
  propertyManagement?: number;
  utilities?: number;
  other?: number;
}

export interface PropertyFinancials {
  purchasePrice: number;
  estimatedMonthlyRent: number;
  monthlyCosts?: MonthlyOperatingCosts;
  downPayment?: number;
  closingCosts?: number;
  estimatedAfterRepairValue?: number;
}

export interface ConfidenceInputs {
  rentEstimateConfidence?: number;
  priceConfidence?: number;
  costConfidence?: number;
  comparableRentCount?: number;
  comparableSaleCount?: number;
  daysSinceRentUpdate?: number;
  daysSinceSaleUpdate?: number;
  hasInspectionReport?: boolean;
}

export interface RiskFlag {
  code: string;
  label: string;
  severity: RiskSeverity;
  blocksPurchase?: boolean;
}

export interface ScoringPolicy {
  weights: {
    rentYield: number;
    cashFlow: number;
    confidence: number;
    risk: number;
  };
  verdictThresholds: {
    yes: number;
    maybe: number;
  };
  severeRiskVerdict: Verdict;
  minimumConfidenceForYes: number;
}

export interface ScoreBreakdown {
  rentYieldPercent: number;
  monthlyCashFlow: number;
  cashOnCashReturnPercent?: number;
  confidence: number;
  riskPenalty: number;
  weightedScore: number;
  verdict: Verdict;
  severeRiskFlags: RiskFlag[];
}

export interface ScoreInputs {
  financials: PropertyFinancials;
  confidence?: ConfidenceInputs;
  riskFlags?: RiskFlag[];
  policy?: Partial<ScoringPolicy>;
}

export const BALANCED_SCORING_POLICY: ScoringPolicy = {
  weights: {
    rentYield: 0.3,
    cashFlow: 0.3,
    confidence: 0.2,
    risk: 0.2,
  },
  verdictThresholds: {
    yes: 72,
    maybe: 50,
  },
  severeRiskVerdict: "no",
  minimumConfidenceForYes: 0.65,
};

const RISK_PENALTY_BY_SEVERITY: Record<RiskSeverity, number> = {
  low: 5,
  medium: 15,
  high: 30,
  severe: 100,
};

export function calculateRentYield(
  annualRentOrMonthlyRent: number,
  purchasePrice: number,
  rentPeriod: "annual" | "monthly" = "monthly",
): number {
  assertPositive(purchasePrice, "purchasePrice");
  assertNonNegative(annualRentOrMonthlyRent, "rent");

  const annualRent =
    rentPeriod === "monthly" ? annualRentOrMonthlyRent * 12 : annualRentOrMonthlyRent;

  return (annualRent / purchasePrice) * 100;
}

export function calculateEstimatedMonthlyCashFlow(
  estimatedMonthlyRent: number,
  monthlyCosts: MonthlyOperatingCosts = {},
): number {
  assertNonNegative(estimatedMonthlyRent, "estimatedMonthlyRent");

  return estimatedMonthlyRent - sumMonthlyCosts(monthlyCosts);
}

export function calculateCashOnCashReturn(
  monthlyCashFlow: number,
  cashInvested: number,
): number | undefined {
  if (cashInvested <= 0) {
    return undefined;
  }

  return ((monthlyCashFlow * 12) / cashInvested) * 100;
}

export function calculateConfidence(inputs: ConfidenceInputs = {}): number {
  const directConfidence = averageDefined([
    inputs.rentEstimateConfidence,
    inputs.priceConfidence,
    inputs.costConfidence,
  ]);

  const comparableConfidence = averageDefined([
    scaleCount(inputs.comparableRentCount, 5),
    scaleCount(inputs.comparableSaleCount, 5),
  ]);

  const freshnessConfidence = averageDefined([
    scaleFreshness(inputs.daysSinceRentUpdate),
    scaleFreshness(inputs.daysSinceSaleUpdate),
  ]);

  const inspectionConfidence = inputs.hasInspectionReport === undefined
    ? undefined
    : inputs.hasInspectionReport
      ? 1
      : 0.45;

  return clamp(
    averageDefined([
      directConfidence,
      comparableConfidence,
      freshnessConfidence,
      inspectionConfidence,
    ]) ?? 0.5,
    0,
    1,
  );
}

export function calculateRiskPenalty(riskFlags: RiskFlag[] = []): number {
  const rawPenalty = riskFlags.reduce(
    (total, flag) => total + RISK_PENALTY_BY_SEVERITY[flag.severity],
    0,
  );

  return clamp(rawPenalty, 0, 100);
}

export function calculateWeightedScore(
  financials: PropertyFinancials,
  confidenceInputs: ConfidenceInputs = {},
  riskFlags: RiskFlag[] = [],
  policy: Partial<ScoringPolicy> = {},
): ScoreBreakdown {
  assertPositive(financials.purchasePrice, "purchasePrice");
  assertNonNegative(financials.estimatedMonthlyRent, "estimatedMonthlyRent");

  const effectivePolicy = mergePolicy(policy);
  const rentYieldPercent = calculateRentYield(
    financials.estimatedMonthlyRent,
    financials.purchasePrice,
  );
  const monthlyCashFlow = calculateEstimatedMonthlyCashFlow(
    financials.estimatedMonthlyRent,
    financials.monthlyCosts,
  );
  const cashInvested = calculateCashInvested(financials);
  const cashOnCashReturnPercent = calculateCashOnCashReturn(monthlyCashFlow, cashInvested);
  const confidence = calculateConfidence(confidenceInputs);
  const riskPenalty = calculateRiskPenalty(riskFlags);
  const severeRiskFlags = riskFlags.filter(
    (flag) => flag.severity === "severe" || flag.blocksPurchase,
  );

  const weightedScore = clamp(
    normalizedRentYieldScore(rentYieldPercent) * effectivePolicy.weights.rentYield
      + normalizedCashFlowScore(monthlyCashFlow, financials.estimatedMonthlyRent)
        * effectivePolicy.weights.cashFlow
      + confidence * 100 * effectivePolicy.weights.confidence
      + (100 - riskPenalty) * effectivePolicy.weights.risk,
    0,
    100,
  );

  return {
    rentYieldPercent,
    monthlyCashFlow,
    cashOnCashReturnPercent,
    confidence,
    riskPenalty,
    weightedScore,
    verdict: determineVerdict(weightedScore, confidence, severeRiskFlags, effectivePolicy),
    severeRiskFlags,
  };
}

export function scoreProperty(inputs: ScoreInputs): ScoreBreakdown {
  return calculateWeightedScore(
    inputs.financials,
    inputs.confidence,
    inputs.riskFlags,
    inputs.policy,
  );
}

export function determineVerdict(
  weightedScore: number,
  confidence: number,
  severeRiskFlags: RiskFlag[] = [],
  policy: ScoringPolicy = BALANCED_SCORING_POLICY,
): Verdict {
  if (severeRiskFlags.length > 0) {
    return policy.severeRiskVerdict;
  }

  if (
    weightedScore >= policy.verdictThresholds.yes
    && confidence >= policy.minimumConfidenceForYes
  ) {
    return "yes";
  }

  if (weightedScore >= policy.verdictThresholds.maybe) {
    return "maybe";
  }

  return "no";
}

function sumMonthlyCosts(costs: MonthlyOperatingCosts): number {
  return Object.values(costs).reduce((total, cost) => total + (cost ?? 0), 0);
}

function calculateCashInvested(financials: PropertyFinancials): number {
  return (financials.downPayment ?? 0) + (financials.closingCosts ?? 0);
}

function normalizedRentYieldScore(rentYieldPercent: number): number {
  // Balanced MVP policy: 8% gross yield is strong, 4% is weak, and values above 12% cap out.
  return clamp(((rentYieldPercent - 4) / 8) * 100, 0, 100);
}

function normalizedCashFlowScore(monthlyCashFlow: number, estimatedMonthlyRent: number): number {
  if (estimatedMonthlyRent <= 0) {
    return monthlyCashFlow > 0 ? 100 : 0;
  }

  const cashFlowMargin = monthlyCashFlow / estimatedMonthlyRent;
  return clamp(((cashFlowMargin + 0.1) / 0.35) * 100, 0, 100);
}

function mergePolicy(policy: Partial<ScoringPolicy>): ScoringPolicy {
  return {
    weights: {
      ...BALANCED_SCORING_POLICY.weights,
      ...policy.weights,
    },
    verdictThresholds: {
      ...BALANCED_SCORING_POLICY.verdictThresholds,
      ...policy.verdictThresholds,
    },
    severeRiskVerdict: policy.severeRiskVerdict ?? BALANCED_SCORING_POLICY.severeRiskVerdict,
    minimumConfidenceForYes:
      policy.minimumConfidenceForYes ?? BALANCED_SCORING_POLICY.minimumConfidenceForYes,
  };
}

function scaleCount(count: number | undefined, excellentCount: number): number | undefined {
  if (count === undefined) {
    return undefined;
  }

  return clamp(count / excellentCount, 0, 1);
}

function scaleFreshness(daysSinceUpdate: number | undefined): number | undefined {
  if (daysSinceUpdate === undefined) {
    return undefined;
  }

  if (daysSinceUpdate <= 30) {
    return 1;
  }

  if (daysSinceUpdate >= 180) {
    return 0.25;
  }

  return 1 - ((daysSinceUpdate - 30) / 150) * 0.75;
}

function averageDefined(values: Array<number | undefined>): number | undefined {
  const definedValues = values.filter((value): value is number => value !== undefined);

  if (definedValues.length === 0) {
    return undefined;
  }

  return definedValues.reduce((total, value) => total + value, 0) / definedValues.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function assertPositive(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive number.`);
  }
}

function assertNonNegative(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative number.`);
  }
}
