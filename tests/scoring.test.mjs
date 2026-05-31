import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateFinancials,
  calculateInvestmentScore
} from "../src/lib/scoring.mjs";

const availableSources = [
  { name: "Rent", status: "available" },
  { name: "Flood", status: "available" },
  { name: "Schools", status: "available" },
  { name: "Crime", status: "available" }
];

test("returns a yes verdict for strong yield and low environmental risk", () => {
  const financials = calculateFinancials({ purchasePrice: 260000, rentEstimate: 2850 });
  const result = calculateInvestmentScore({
    financials,
    sources: availableSources,
    trends: { score: 72 },
    environment: [
      { label: "Flood", score: 88, severity: "low" },
      { label: "Schools", score: 80, severity: "low" },
      { label: "Crime", score: 78, severity: "low" }
    ]
  });

  assert.equal(result.verdict, "yes");
  assert.equal(result.confidence, "high");
});

test("returns no when severe risks stack up", () => {
  const financials = calculateFinancials({ purchasePrice: 260000, rentEstimate: 2800 });
  const result = calculateInvestmentScore({
    financials,
    sources: availableSources,
    trends: { score: 75 },
    environment: [
      { label: "Flood", score: 20, severity: "high" },
      { label: "Crime", score: 30, severity: "high" },
      { label: "Schools", score: 80, severity: "low" }
    ]
  });

  assert.equal(result.verdict, "no");
  assert.equal(result.confidence, "low");
});

test("missing sources lower confidence instead of inventing certainty", () => {
  const financials = calculateFinancials({ purchasePrice: 450000, rentEstimate: 2200 });
  const result = calculateInvestmentScore({
    financials,
    sources: [
      { name: "Rent", status: "partial" },
      { name: "Flood", status: "available" },
      { name: "Schools", status: "unavailable" },
      { name: "Crime", status: "unavailable" }
    ],
    trends: { score: 50 },
    environment: [
      { label: "Flood", score: 65, severity: "medium" },
      { label: "Schools", score: null, severity: "unknown" },
      { label: "Crime", score: null, severity: "unknown" }
    ]
  });

  assert.equal(result.verdict, "no");
  assert.equal(result.confidence, "medium");
});
