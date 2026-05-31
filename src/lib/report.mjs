import { currency, percent } from "./scoring.mjs";

export function buildGroundedReport({ verdictResult, financials, environment, rent, geo }) {
  const pros = [];
  const cons = [];
  const caveats = [];

  if (financials.grossYield >= 8) {
    pros.push(`Estimated gross rental yield is strong at ${percent(financials.grossYield)}.`);
  } else if (financials.grossYield >= 5.5) {
    pros.push(`Estimated gross rental yield is workable at ${percent(financials.grossYield)}.`);
  } else {
    cons.push(`Estimated gross rental yield is thin at ${percent(financials.grossYield)}.`);
  }

  if (financials.estimatedCashFlow > 250) {
    pros.push(`The simplified cash-flow estimate is positive at ${currency(financials.estimatedCashFlow)} per month.`);
  } else if (financials.estimatedCashFlow < 0) {
    cons.push(`The simplified cash-flow estimate is negative at ${currency(financials.estimatedCashFlow)} per month.`);
  } else {
    caveats.push("Cash flow is close to break-even, so mortgage terms, repairs, taxes, HOA, and vacancy could change the verdict.");
  }

  environment.forEach((item) => {
    if (item.score === null || item.score === undefined) {
      caveats.push(`${item.label} data was unavailable and lowered confidence.`);
    } else if (item.severity === "high") {
      cons.push(`${item.label} is a high-risk signal and should be reviewed before buying.`);
    } else if (item.score >= 75) {
      pros.push(`${item.label} looks favorable based on the available data.`);
    }
  });

  if (verdictResult.confidence !== "high") {
    caveats.push("This report uses partial free/free-tier data, so treat it as a screening tool rather than final underwriting.");
  }

  if (!geo.coordinates) {
    caveats.push("The address could not be geocoded to precise coordinates, limiting flood and location checks.");
  }

  if (rent.source.status !== "available") {
    caveats.push("Rental comps are fallback estimates because a live rent data provider is not configured or did not return a result.");
  }

  const summary =
    verdictResult.verdict === "yes"
      ? "This property screens as a promising buy, with the important caveat that due diligence should confirm financing, repairs, and local risks."
      : verdictResult.verdict === "no"
        ? "This property does not screen well enough for a confident buy recommendation based on the current numbers and risk signals."
        : "This property is mixed: it may be worth a closer look, but the current data does not support a clean yes.";

  return {
    summary,
    pros: pros.slice(0, 5),
    cons: cons.slice(0, 5),
    caveats: [...new Set(caveats)].slice(0, 6),
    aiStatus: "deterministic-fallback"
  };
}

export async function generateGroundedAnalysis(input) {
  const fallback = buildGroundedReport(input);
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) return fallback;

  const facts = {
    verdict: input.verdictResult.verdict,
    score: input.verdictResult.score,
    confidence: input.verdictResult.confidence,
    financials: input.financials,
    environment: input.environment,
    rentSourceStatus: input.rent.source.status,
    hasCoordinates: Boolean(input.geo.coordinates),
    deterministicDraft: fallback
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5",
        input: [
          {
            role: "system",
            content:
              "You write concise property investment screening reports. Use only the provided facts. Do not add crime, school, flood, rent, trend, or comp claims that are not present. Return strict JSON only."
          },
          {
            role: "user",
            content: `Create a grounded report from these facts. JSON shape: {"summary":"string","pros":["string"],"cons":["string"],"caveats":["string"]}. Keep each list to 5 items or fewer.\n\n${JSON.stringify(facts)}`
          }
        ]
      })
    });

    if (!response.ok) throw new Error(`OpenAI returned ${response.status}`);

    const payload = await response.json();
    const text = extractResponseText(payload);
    const generated = JSON.parse(text);
    return normalizeGeneratedReport(generated, fallback);
  } catch (error) {
    return {
      ...fallback,
      caveats: [
        ...fallback.caveats,
        "AI narrative generation was unavailable, so this report used the deterministic grounded fallback."
      ],
      aiStatus: "fallback-after-ai-error"
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractResponseText(payload) {
  if (typeof payload.output_text === "string") return payload.output_text;

  const parts = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n");
}

function normalizeGeneratedReport(generated, fallback) {
  const summary =
    typeof generated.summary === "string" && generated.summary.trim()
      ? generated.summary.trim()
      : fallback.summary;

  return {
    summary,
    pros: normalizeList(generated.pros, fallback.pros),
    cons: normalizeList(generated.cons, fallback.cons),
    caveats: normalizeList(generated.caveats, fallback.caveats),
    aiStatus: "openai-generated"
  };
}

function normalizeList(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  const clean = value
    .filter((item) => typeof item === "string" && item.trim())
    .map((item) => item.trim())
    .slice(0, 5);
  return clean.length ? clean : fallback;
}
