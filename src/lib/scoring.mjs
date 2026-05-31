export const VERDICT = {
  YES: "yes",
  MAYBE: "maybe",
  NO: "no"
};

export function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

export function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number.isFinite(value) ? value : 0);
}

export function percent(value, digits = 1) {
  return `${(Number.isFinite(value) ? value : 0).toFixed(digits)}%`;
}

export function calculateFinancials({ purchasePrice, rentEstimate }) {
  const price = Number(purchasePrice) || 0;
  const rent = Number(rentEstimate) || 0;
  const annualRent = rent * 12;
  const grossYield = price > 0 ? (annualRent / price) * 100 : 0;
  const estimatedMonthlyCosts = price > 0 ? price * 0.0062 : 0;
  const estimatedCashFlow = rent - estimatedMonthlyCosts;
  const cashOnCashProxy = price > 0 ? ((estimatedCashFlow * 12) / (price * 0.25)) * 100 : 0;

  return {
    purchasePrice: price,
    rentEstimate: rent,
    annualRent,
    grossYield,
    estimatedMonthlyCosts,
    estimatedCashFlow,
    cashOnCashProxy
  };
}

export function scoreFinancials(financials) {
  const yieldScore = clamp((financials.grossYield / 10) * 100);
  const cashFlowScore = clamp(50 + financials.estimatedCashFlow / 25);
  return Math.round(yieldScore * 0.62 + cashFlowScore * 0.38);
}

export function scoreEnvironment(environment) {
  const available = environment.filter((item) => item.score !== null && item.score !== undefined);
  if (!available.length) return { score: 50, confidencePenalty: 22 };

  const score =
    available.reduce((total, item) => total + Number(item.score), 0) / available.length;
  const missingPenalty = (environment.length - available.length) * 5;
  return {
    score: Math.round(clamp(score - missingPenalty, 0, 100)),
    confidencePenalty: missingPenalty
  };
}

export function confidenceFromSources(sources, severeRiskCount = 0) {
  const usable = sources.filter((source) => source.status === "available").length;
  const partial = sources.filter((source) => source.status === "partial").length;
  const total = sources.length || 1;
  const ratio = (usable + partial * 0.5) / total;

  if (severeRiskCount > 0 || ratio < 0.35) return "low";
  if (ratio < 0.72) return "medium";
  return "high";
}

export function calculateInvestmentScore({ financials, environment, sources, trends }) {
  const financialScore = scoreFinancials(financials);
  const environmentResult = scoreEnvironment(environment);
  const trendScore = trends?.score ?? 50;
  const severeRiskCount = environment.filter((item) => item.severity === "high").length;
  const confidence = confidenceFromSources(sources, severeRiskCount);
  const confidenceAdjustment = confidence === "high" ? 4 : confidence === "medium" ? -4 : -13;
  const severeRiskPenalty = severeRiskCount * 14;

  const score = Math.round(
    clamp(
      financialScore * 0.48 +
        environmentResult.score * 0.32 +
        trendScore * 0.2 +
        confidenceAdjustment -
        severeRiskPenalty,
      0,
      100
    )
  );

  let verdict = VERDICT.MAYBE;
  if (score >= 72 && severeRiskCount === 0 && confidence !== "low") verdict = VERDICT.YES;
  if (score < 54 || severeRiskCount >= 2 || financials.grossYield < 3.2) verdict = VERDICT.NO;

  return {
    score,
    verdict,
    confidence,
    components: {
      financial: financialScore,
      environment: environmentResult.score,
      trend: trendScore
    },
    severeRiskCount
  };
}
