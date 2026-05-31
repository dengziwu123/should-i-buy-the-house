import { NextResponse } from "next/server";
import { fetchFloodRisk, fetchOpenEnvironmentSignals, fetchRentCast, geocodeAddress } from "@/lib/data.mjs";
import { calculateFinancials, calculateInvestmentScore } from "@/lib/scoring.mjs";
import { generateGroundedAnalysis } from "@/lib/report.mjs";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const address = String(body.address || "").trim();
  const purchasePrice = Number(body.purchasePrice);

  if (!address || !Number.isFinite(purchasePrice) || purchasePrice <= 0) {
    return NextResponse.json(
      { error: "Enter a complete address and a valid purchase price." },
      { status: 400 }
    );
  }

  const geo = await geocodeAddress(address);
  if (!geo.ok) {
    return NextResponse.json(
      { error: geo.error || "We could not confidently match that address." },
      { status: 422 }
    );
  }

  const normalizedAddress = geo.normalizedAddress || address;
  const [rent, flood, openEnvironment] = await Promise.all([
    fetchRentCast({ address: normalizedAddress, purchasePrice }),
    fetchFloodRisk(geo),
    Promise.resolve(fetchOpenEnvironmentSignals(normalizedAddress))
  ]);

  const financials = calculateFinancials({ purchasePrice, rentEstimate: rent.rentEstimate });
  const environment = [flood.rating, ...openEnvironment.ratings];
  const sources = [geo.source, rent.source, flood.source, ...openEnvironment.sources];
  const verdictResult = calculateInvestmentScore({
    financials,
    environment,
    sources,
    trends: rent.trends
  });
  const report = await generateGroundedAnalysis({
    verdictResult,
    financials,
    environment,
    rent,
    geo
  });

  return NextResponse.json({
    address: normalizedAddress,
    coordinates: geo.coordinates,
    verdict: verdictResult.verdict,
    score: verdictResult.score,
    confidence: verdictResult.confidence,
    components: verdictResult.components,
    financials,
    environment,
    comps: rent.comps,
    trends: rent.trends,
    pros: report.pros,
    cons: report.cons,
    caveats: report.caveats,
    summary: report.summary,
    aiStatus: report.aiStatus,
    sources
  });
}
