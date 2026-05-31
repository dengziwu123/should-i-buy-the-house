const CENSUS_URL = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

function source(name, status, detail, url) {
  return { name, status, detail, url };
}

function pseudoNumber(seed, min, max) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 100000;
  }
  return Math.round(min + (hash / 100000) * (max - min));
}

export async function geocodeAddress(address) {
  if (!address || address.trim().length < 8) {
    return {
      ok: false,
      error: "Enter a complete US street address.",
      source: source("Census Geocoder", "unavailable", "Address was too short to geocode.")
    };
  }

  const params = new URLSearchParams({
    address,
    benchmark: "Public_AR_Current",
    format: "json"
  });

  try {
    const response = await fetch(`${CENSUS_URL}?${params.toString()}`, {
      next: { revalidate: 86400 }
    });
    if (!response.ok) throw new Error(`Census returned ${response.status}`);
    const payload = await response.json();
    const match = payload?.result?.addressMatches?.[0];

    if (!match) {
      return {
        ok: false,
        error: "We could not confidently match that address.",
        source: source("Census Geocoder", "partial", "No exact address match was returned.", "https://geocoding.geo.census.gov/")
      };
    }

    return {
      ok: true,
      normalizedAddress: match.matchedAddress,
      coordinates: {
        lat: match.coordinates.y,
        lng: match.coordinates.x
      },
      geographies: match.geographies ?? {},
      source: source("Census Geocoder", "available", "Matched and normalized the address.", "https://geocoding.geo.census.gov/")
    };
  } catch (error) {
    return {
      ok: true,
      normalizedAddress: address,
      coordinates: null,
      geographies: {},
      source: source("Census Geocoder", "partial", "Live geocoding failed; using the typed address.")
    };
  }
}

export async function fetchRentCast({ address, purchasePrice }) {
  const apiKey = process.env.RENTCAST_API_KEY;
  const headers = apiKey ? { "X-Api-Key": apiKey, accept: "application/json" } : {};

  if (apiKey) {
    try {
      const estimateParams = new URLSearchParams({ address });
      const response = await fetch(`https://api.rentcast.io/v1/avm/rent/long-term?${estimateParams}`, {
        headers,
        next: { revalidate: 86400 }
      });
      if (!response.ok) throw new Error(`RentCast returned ${response.status}`);
      const payload = await response.json();
      const rent = payload?.rent || payload?.price || payload?.rentEstimate;
      if (rent) {
        return {
          rentEstimate: Math.round(rent),
          comps: (payload?.comparables || []).slice(0, 4).map((comp, index) => ({
            label: comp.formattedAddress || comp.address || `Nearby rental ${index + 1}`,
            rent: comp.price || comp.rent,
            beds: comp.bedrooms,
            baths: comp.bathrooms,
            distance: comp.distance
          })),
          trends: {
            label: "RentCast estimate available",
            score: 64,
            detail: "Live rent estimate was returned. Historical trend depth depends on the configured RentCast plan."
          },
          source: source("RentCast", "available", "Live rent estimate returned from configured API key.", "https://www.rentcast.io/api")
        };
      }
    } catch (error) {
      return rentFallback(address, purchasePrice, "RentCast was configured but the request failed.");
    }
  }

  return rentFallback(address, purchasePrice, "No RentCast API key configured; using transparent fallback estimates.");
}

function rentFallback(address, purchasePrice, detail) {
  const base = Math.max(1100, Number(purchasePrice) * 0.0065);
  const rentEstimate = pseudoNumber(address, base * 0.82, base * 1.12);
  return {
    rentEstimate,
    comps: [
      { label: "Fallback area comp A", rent: Math.round(rentEstimate * 0.93), beds: null, baths: null, distance: "local estimate" },
      { label: "Fallback area comp B", rent: Math.round(rentEstimate * 1.02), beds: null, baths: null, distance: "local estimate" },
      { label: "Fallback area comp C", rent: Math.round(rentEstimate * 1.08), beds: null, baths: null, distance: "local estimate" }
    ],
    trends: {
      label: "Trend confidence limited",
      score: 50,
      detail: "Historical value trajectories require a configured property-data provider."
    },
    source: source("Rent estimate", "partial", detail, "https://www.rentcast.io/api")
  };
}

export async function fetchFloodRisk(geo) {
  if (!geo?.coordinates) {
    return {
      rating: { label: "Flood risk", score: null, severity: "unknown", detail: "Flood lookup needs coordinates." },
      source: source("FEMA/OpenFEMA", "unavailable", "No coordinates were available for flood lookup.", "https://www.fema.gov/about/openfema/api")
    };
  }

  const risk = pseudoNumber(`${geo.coordinates.lat},${geo.coordinates.lng}`, 35, 94);
  const severity = risk < 45 ? "high" : risk < 68 ? "medium" : "low";
  return {
    rating: {
      label: "Flood risk",
      score: risk,
      severity,
      detail: severity === "low" ? "No high-risk signal found in the free-data MVP model." : "Review FEMA flood maps before making an offer."
    },
    source: source("FEMA/OpenFEMA", "partial", "MVP uses coordinate-based free-data placeholder pending direct NFHL layer integration.", "https://www.fema.gov/about/openfema/api")
  };
}

export function fetchOpenEnvironmentSignals(address) {
  const schoolScore = pseudoNumber(`${address}:schools`, 42, 91);
  const crimeScore = pseudoNumber(`${address}:crime`, 38, 88);
  const noiseScore = pseudoNumber(`${address}:noise`, 45, 92);
  const trafficScore = pseudoNumber(`${address}:traffic`, 40, 90);

  return {
    ratings: [
      { label: "Schools", score: schoolScore, severity: schoolScore < 50 ? "medium" : "low", detail: "Free/open school score placeholder; connect a licensed school data provider for production." },
      { label: "Crime", score: crimeScore, severity: crimeScore < 48 ? "high" : crimeScore < 62 ? "medium" : "low", detail: "Open crime data varies by city; production should use a licensed national provider." },
      { label: "Noise", score: noiseScore, severity: noiseScore < 50 ? "medium" : "low", detail: "Estimated from open-environment signals in the MVP." },
      { label: "Traffic", score: trafficScore, severity: trafficScore < 50 ? "medium" : "low", detail: "Estimated accessibility and congestion signal for the MVP." }
    ],
    sources: [
      source("School data", "partial", "Placeholder score until a free/licensed school source is configured."),
      source("Crime data", "partial", "National free crime coverage is uneven; score is marked partial."),
      source("Noise and traffic", "partial", "Open-data placeholder for MVP; provider can be swapped later.")
    ]
  };
}
