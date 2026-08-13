export type PlaceInput = {
  name: string;
  id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  recommended_stay_minutes?: number | null;
  category_slug?: string | null;
};

export type ItineraryGenerateRequest = {
  start: PlaceInput;
  end: PlaceInput;
  days: number;
  nights: number;
  hours_per_day: number;
  interests?: string[];
  preferred_mode?: "driving";
};

export type RecomputeStopInput = PlaceInput & {
  order?: number | null;
  day?: number | null;
  stay_min?: number | null;
};

export type ItineraryRecomputeRequest = {
  start: PlaceInput;
  end: PlaceInput;
  destinations: RecomputeStopInput[];
  days: number;
  nights: number;
  hours_per_day: number;
  interests?: string[];
  preferred_mode?: "driving";
  /** Re-order by corridor and re-pack days (used when adding a stop). */
  optimize_order?: boolean;
};

export type PlaceRef = {
  id: string;
  name: string;
};

export type OrderedDestination = {
  id: string;
  name: string;
  order: number;
  day: number;
  stay_min: number;
  latitude?: number | null;
  longitude?: number | null;
  category_slug?: string | null;
};

export type TransportOption = {
  mode: string;
  duration_min: number;
  distance_km: number;
  carbon_kg: number;
  is_default: boolean;
  is_estimated: boolean;
};

export type ItineraryLeg = {
  from_place: PlaceRef;
  to_place: PlaceRef;
  distance_km: number;
  duration_min: number;
  transport_options: TransportOption[];
  selected_mode: string;
  day?: number | null;
  steps?: Record<string, unknown>[];
  /** Driving polyline as [lat, lng][] */
  path?: number[][];
};

export type ItineraryTotals = {
  duration_min: number;
  travel_duration_min: number;
  stay_duration_min: number;
  distance_km: number;
  carbon_kg: number;
};

export type DayTotal = {
  day: number;
  travel_duration_min: number;
  stay_duration_min: number;
  duration_min: number;
};

export type SustainabilityRating = "excellent" | "good" | "moderate" | "low";

export type SustainabilityModeBreakdown = {
  mode: string;
  carbon_kg: number;
  distance_km: number;
  share_percent: number;
};

export type SustainabilityLegBreakdown = {
  index: number;
  from_name: string;
  to: string;
  day: number;
  distance_km: number;
  carbon_kg: number;
  mode: string;
};

export type SustainabilitySummary = {
  score: number;
  rating: SustainabilityRating | string;
  total_footprint_kg: number;
  baseline_footprint_kg: number;
  emissions_reduced_kg: number;
  reduction_percent: number;
  distance_km: number;
  modes_used: string[];
  breakdown_by_mode: SustainabilityModeBreakdown[];
  breakdown_by_leg: SustainabilityLegBreakdown[];
  impact_text: string;
  has_transport_data: boolean;
};

export type ItineraryGenerateResponse = {
  start_location: string;
  end_location: string;
  days: number;
  nights?: number;
  hours_per_day: number;
  interests: string[];
  preferred_mode?: string;
  destinations: OrderedDestination[];
  legs: ItineraryLeg[];
  totals: ItineraryTotals;
  day_totals: DayTotal[];
  excluded_destinations: string[];
  notes: string[];
  sustainability?: SustainabilitySummary | null;
};

export type PlaceCoords = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  image?: string | null;
  category_slug?: string | null;
  state?: string | null;
};

export type ItineraryResultState = {
  itinerary: ItineraryGenerateResponse;
  places: PlaceCoords[];
};

export type TripStatus = "upcoming" | "completed";

export type SavedItinerarySummary = {
  id: string;
  name: string;
  start_point: string;
  end_point: string;
  location: string;
  date: string;
  days: number;
  nights: number;
  travelers: number;
  hours_per_day: number;
  eco_score: number;
  carbon_kg?: number;
  baseline_footprint_kg?: number;
  emissions_reduced_kg?: number;
  reduction_percent?: number;
  status: TripStatus;
  image: string;
  is_favourite: boolean;
  created_at?: string | null;
};

export type SavedItineraryDetail = SavedItinerarySummary & {
  itinerary: ItineraryGenerateResponse;
  places: PlaceCoords[];
};

export type ItinerarySaveRequest = {
  name?: string | null;
  itinerary: ItineraryGenerateResponse;
  places: PlaceCoords[];
  travelers?: number;
};

export const ITINERARY_RESULT_STORAGE_KEY = "msj.itinerary.result";
