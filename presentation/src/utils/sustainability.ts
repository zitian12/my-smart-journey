import type {
  ItineraryGenerateResponse,
  ItineraryLeg,
  SustainabilityRating,
  SustainabilitySummary,
} from "../types/itinerary";

const BASELINE_MODE = "driving";

const EMISSION_FACTORS_KG_PER_KM: Record<string, number> = {
  walking: 0.0,
  walk: 0.0,
  foot: 0.0,
  pedestrian: 0.0,
  cycling: 0.0,
  bike: 0.0,
  bicycle: 0.0,
  train: 0.041,
  lrt: 0.041,
  mrt: 0.041,
  bus: 0.105,
  transit: 0.105,
  public_transport: 0.105,
  motorcycle: 0.113,
  driving: 0.171,
  car: 0.171,
  grab: 0.171,
  private_car: 0.171,
  ev: 0.07,
  ev_car: 0.07,
  electric: 0.07,
  flight: 0.255,
  domestic_flight: 0.255,
};

const CANONICAL_MODE: Record<string, string> = {
  walking: "walking",
  walk: "walking",
  foot: "walking",
  pedestrian: "walking",
  cycling: "cycling",
  bike: "cycling",
  bicycle: "cycling",
  train: "train",
  lrt: "train",
  mrt: "train",
  bus: "bus",
  transit: "transit",
  public_transport: "transit",
  motorcycle: "motorcycle",
  driving: "driving",
  car: "driving",
  grab: "driving",
  private_car: "driving",
  ev: "ev",
  ev_car: "ev",
  electric: "ev",
  flight: "flight",
  domestic_flight: "flight",
};

const NO_DATA_MESSAGE =
  "No confirmed transportation data is available to calculate a sustainability score.";

export const MODE_LABELS: Record<string, string> = {
  driving: "Car",
  walking: "Walking",
  cycling: "Cycling",
  train: "Train",
  bus: "Bus",
  transit: "Public Transport",
  public_transport: "Public Transport",
  motorcycle: "Motorcycle",
  ev: "EV",
  flight: "Flight",
};

export function modeLabel(mode: string): string {
  return MODE_LABELS[mode] ?? mode;
}

export function ratingLabel(rating: string): string {
  if (rating === "excellent") return "Excellent";
  if (rating === "good") return "Good";
  if (rating === "moderate") return "Moderate";
  return "Low";
}

const ZERO_TAILPIPE_MODES = new Set(["walking", "cycling"]);

function normalizeMode(mode: string | null | undefined): string {
  const key = (mode || BASELINE_MODE).trim().toLowerCase();
  return CANONICAL_MODE[key] ?? BASELINE_MODE;
}

function emissionFactor(mode: string | null | undefined): number {
  const canonical = normalizeMode(mode);
  return (
    EMISSION_FACTORS_KG_PER_KM[canonical] ??
    EMISSION_FACTORS_KG_PER_KM[BASELINE_MODE]
  );
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function ratingForScore(score: number): SustainabilityRating {
  if (score >= 80) return "excellent";
  if (score >= 60) return "good";
  if (score >= 40) return "moderate";
  return "low";
}

function impactTextForPercent(reductionPercent: number): string {
  const pct = round1(reductionPercent);
  if (pct >= 70) {
    return `Excellent! This itinerary produces ${pct}% less carbon than the average route.`;
  }
  if (pct >= 40) {
    return `Good progress — this itinerary cuts carbon emissions by ${pct}% compared to driving.`;
  }
  if (pct >= 1) {
    return `This itinerary reduces emissions by ${pct}%, but there's room to switch more legs to public transport.`;
  }
  return "This itinerary currently matches private-vehicle emissions — consider public transport or walking for some legs.";
}

function selectedMetrics(
  leg: ItineraryLeg,
): { mode: string; distanceKm: number; carbonKg: number | null } {
  const selected = leg.selected_mode || "driving";
  const match = (leg.transport_options || []).find((opt) => opt.mode === selected);
  if (match) {
    return {
      mode: selected,
      distanceKm: match.distance_km || 0,
      carbonKg:
        typeof match.carbon_kg === "number" ? match.carbon_kg : null,
    };
  }
  return { mode: selected, distanceKm: leg.distance_km || 0, carbonKg: null };
}

export function evaluateSustainability(
  legs: ItineraryLeg[] | null | undefined,
): SustainabilitySummary {
  const rows = legs || [];
  const modeCarbon = new Map<string, number>();
  const modeDistance = new Map<string, number>();
  let totalFootprint = 0;
  let baselineFootprint = 0;
  let distanceKm = 0;
  const breakdownByLeg = rows.map((leg, index) => {
    const { mode: rawMode, distanceKm: distance, carbonKg: optionCarbon } =
      selectedMetrics(leg);
    const mode = normalizeMode(rawMode);
    const carbon = ZERO_TAILPIPE_MODES.has(mode)
      ? 0
      : optionCarbon != null
        ? round3(optionCarbon)
        : round3(distance * emissionFactor(rawMode));
    const baselineLeg = round3(distance * EMISSION_FACTORS_KG_PER_KM[BASELINE_MODE]);
    totalFootprint += carbon;
    baselineFootprint += baselineLeg;
    distanceKm += distance;
    modeCarbon.set(mode, (modeCarbon.get(mode) || 0) + carbon);
    modeDistance.set(mode, (modeDistance.get(mode) || 0) + distance);
    return {
      index: index + 1,
      from_name: leg.from_place?.name || "",
      to: leg.to_place?.name || "",
      day: leg.day || 1,
      distance_km: round3(distance),
      carbon_kg: carbon,
      mode,
    };
  });

  totalFootprint = round3(totalFootprint);
  baselineFootprint = round3(baselineFootprint);
  distanceKm = round3(distanceKm);

  if (baselineFootprint <= 0) {
    return {
      score: 0,
      rating: "low",
      total_footprint_kg: 0,
      baseline_footprint_kg: 0,
      emissions_reduced_kg: 0,
      reduction_percent: 0,
      distance_km: distanceKm,
      modes_used: [],
      breakdown_by_mode: [],
      breakdown_by_leg: breakdownByLeg,
      impact_text: NO_DATA_MESSAGE,
      has_transport_data: false,
    };
  }

  const emissionsReduced = Math.max(0, round3(baselineFootprint - totalFootprint));
  const reductionPercent = Math.max(
    0,
    Math.min(100, round1((emissionsReduced / baselineFootprint) * 100)),
  );
  const modesUsed = [...modeCarbon.keys()];
  const breakdownByMode = modesUsed.map((mode) => {
    const carbon = round3(modeCarbon.get(mode) || 0);
    const share =
      totalFootprint > 0
        ? round1((carbon / totalFootprint) * 100)
        : modesUsed.length === 1
          ? 100
          : 0;
    return {
      mode,
      carbon_kg: carbon,
      distance_km: round3(modeDistance.get(mode) || 0),
      share_percent: share,
    };
  });

  return {
    score: reductionPercent,
    rating: ratingForScore(reductionPercent),
    total_footprint_kg: totalFootprint,
    baseline_footprint_kg: baselineFootprint,
    emissions_reduced_kg: emissionsReduced,
    reduction_percent: reductionPercent,
    distance_km: distanceKm,
    modes_used: modesUsed,
    breakdown_by_mode: breakdownByMode,
    breakdown_by_leg: breakdownByLeg,
    impact_text: impactTextForPercent(reductionPercent),
    has_transport_data: true,
  };
}

export function resolveSustainability(
  itinerary: ItineraryGenerateResponse | null | undefined,
): SustainabilitySummary {
  if (itinerary?.legs?.length) {
    return evaluateSustainability(itinerary.legs);
  }
  if (itinerary?.sustainability && itinerary.sustainability.score != null) {
    return itinerary.sustainability;
  }
  return evaluateSustainability(itinerary?.legs);
}

export type TripFootprint = {
  carbon_kg?: number;
  baseline_footprint_kg?: number;
  emissions_reduced_kg?: number;
};

export function aggregateTripFootprints(
  trips: TripFootprint[],
): SustainabilitySummary {
  let totalFootprint = 0;
  let baselineFootprint = 0;
  for (const trip of trips) {
    totalFootprint += trip.carbon_kg || 0;
    baselineFootprint += trip.baseline_footprint_kg || 0;
  }
  totalFootprint = round3(totalFootprint);
  baselineFootprint = round3(baselineFootprint);

  if (baselineFootprint <= 0) {
    return {
      score: 0,
      rating: "low",
      total_footprint_kg: 0,
      baseline_footprint_kg: 0,
      emissions_reduced_kg: 0,
      reduction_percent: 0,
      distance_km: 0,
      modes_used: [],
      breakdown_by_mode: [],
      breakdown_by_leg: [],
      impact_text: NO_DATA_MESSAGE,
      has_transport_data: false,
    };
  }

  const emissionsReduced = Math.max(0, round3(baselineFootprint - totalFootprint));
  const reductionPercent = Math.max(
    0,
    Math.min(100, round1((emissionsReduced / baselineFootprint) * 100)),
  );

  return {
    score: reductionPercent,
    rating: ratingForScore(reductionPercent),
    total_footprint_kg: totalFootprint,
    baseline_footprint_kg: baselineFootprint,
    emissions_reduced_kg: emissionsReduced,
    reduction_percent: reductionPercent,
    distance_km: 0,
    modes_used: [],
    breakdown_by_mode: [],
    breakdown_by_leg: [],
    impact_text: impactTextForPercent(reductionPercent),
    has_transport_data: true,
  };
}

/** Display buckets for All-trips + Monthly mode charts. */
export type MonthlyModeBucket = "driving" | "transit" | "walking";

export type MonthlyModeBreakdownRow = {
  mode: MonthlyModeBucket;
  carbon_kg: number;
  saved_kg: number;
  distance_km: number;
  share_percent: number;
  trip_count: number;
};

const MONTHLY_BUCKET_ORDER: MonthlyModeBucket[] = [
  "driving",
  "transit",
  "walking",
];

function toMonthlyBucket(mode: string): MonthlyModeBucket {
  const key = normalizeMode(mode);
  if (key === "walking" || key === "cycling") return "walking";
  if (key === "transit" || key === "bus" || key === "train") return "transit";
  // driving, motorcycle, ev, flight, etc. → Car bucket for monthly charts
  return "driving";
}

/**
 * Aggregate per-trip sustainability into Car / Public Transport / Walking
 * for All trips period charts (All time / Monthly / Annual).
 */
export function aggregatePeriodModeBreakdown(
  itineraries: Array<ItineraryGenerateResponse | null | undefined>,
): MonthlyModeBreakdownRow[] {
  const carbon = new Map<MonthlyModeBucket, number>([
    ["driving", 0],
    ["transit", 0],
    ["walking", 0],
  ]);
  const distance = new Map<MonthlyModeBucket, number>([
    ["driving", 0],
    ["transit", 0],
    ["walking", 0],
  ]);
  const saved = new Map<MonthlyModeBucket, number>([
    ["driving", 0],
    ["transit", 0],
    ["walking", 0],
  ]);
  const tripsWithMode = new Map<MonthlyModeBucket, number>([
    ["driving", 0],
    ["transit", 0],
    ["walking", 0],
  ]);

  for (const itinerary of itineraries) {
    if (!itinerary) continue;
    const summary = itinerary.legs?.length
      ? evaluateSustainability(itinerary.legs)
      : resolveSustainability(itinerary);
    if (!summary.has_transport_data) continue;

    const present = new Set<MonthlyModeBucket>();
    const rows =
      summary.breakdown_by_mode?.length > 0
        ? summary.breakdown_by_mode
        : summary.breakdown_by_leg.map((leg) => ({
            mode: leg.mode,
            carbon_kg: leg.carbon_kg,
            distance_km: leg.distance_km,
            share_percent: 0,
          }));

    if (rows.length === 0) continue;
    for (const row of rows) {
      const bucket = toMonthlyBucket(row.mode);
      present.add(bucket);
      const distanceKm = Math.max(0, Number(row.distance_km) || 0);
      const carbonKg =
        bucket === "walking"
          ? 0
          : Math.max(0, Number(row.carbon_kg) || 0);
      carbon.set(bucket, (carbon.get(bucket) || 0) + carbonKg);
      distance.set(bucket, (distance.get(bucket) || 0) + distanceKm);
      // Savings vs car baseline for the same distance (driving → 0)
      const baselineForDistance =
        distanceKm * EMISSION_FACTORS_KG_PER_KM[BASELINE_MODE];
      const savedKg =
        bucket === "driving"
          ? 0
          : Math.max(0, baselineForDistance - carbonKg);
      saved.set(bucket, (saved.get(bucket) || 0) + savedKg);
    }

    for (const bucket of present) {
      tripsWithMode.set(bucket, (tripsWithMode.get(bucket) || 0) + 1);
    }
  }

  const totalCarbon = MONTHLY_BUCKET_ORDER.reduce(
    (sum, mode) => sum + (carbon.get(mode) || 0),
    0,
  );

  return MONTHLY_BUCKET_ORDER.map((mode) => {
    const carbonKg = round3(carbon.get(mode) || 0);
    const share =
      totalCarbon > 0
        ? round1((carbonKg / totalCarbon) * 100)
        : 0;
    return {
      mode,
      carbon_kg: carbonKg,
      saved_kg: round3(saved.get(mode) || 0),
      distance_km: round3(distance.get(mode) || 0),
      share_percent: share,
      trip_count: tripsWithMode.get(mode) || 0,
    };
  }).filter(
    (row) =>
      row.trip_count > 0 || row.carbon_kg > 0 || row.distance_km > 0,
  );
}

