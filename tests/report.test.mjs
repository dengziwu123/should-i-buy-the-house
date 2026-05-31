import test from "node:test";
import assert from "node:assert/strict";
import { buildGroundedReport } from "../src/lib/report.mjs";

test("grounded report calls out missing and partial data instead of inventing facts", () => {
  const report = buildGroundedReport({
    verdictResult: { verdict: "maybe", confidence: "medium", score: 61 },
    financials: {
      grossYield: 5.9,
      estimatedCashFlow: 80
    },
    environment: [
      { label: "Schools", score: null, severity: "unknown" },
      { label: "Flood risk", score: 80, severity: "low" }
    ],
    rent: {
      source: { status: "partial" }
    },
    geo: {
      coordinates: { lat: 33.7, lng: -84.3 }
    }
  });

  assert.match(report.summary, /mixed/i);
  assert.ok(report.pros.some((item) => item.includes("yield")));
  assert.ok(report.caveats.some((item) => item.includes("Schools data was unavailable")));
  assert.ok(report.caveats.some((item) => item.includes("Rental comps are fallback estimates")));
});

test("high severity environment items become cons", () => {
  const report = buildGroundedReport({
    verdictResult: { verdict: "no", confidence: "low", score: 42 },
    financials: {
      grossYield: 4.1,
      estimatedCashFlow: -300
    },
    environment: [
      { label: "Crime", score: 30, severity: "high" }
    ],
    rent: {
      source: { status: "available" }
    },
    geo: {
      coordinates: null
    }
  });

  assert.ok(report.cons.some((item) => item.includes("Crime")));
  assert.ok(report.cons.some((item) => item.includes("negative")));
  assert.ok(report.caveats.some((item) => item.includes("could not be geocoded")));
});
