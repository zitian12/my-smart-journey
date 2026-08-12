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
  destinations: PlaceInput[];
  days?: number | null;
  hours_per_day?: number | null;
  interests?: string[];
  nights?: number | null;
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

export type ItineraryGenerateResponse = {
  start_location: string;
  end_location: string;
  days: number;
  nights?: number;
  hours_per_day: number;
  interests: string[];
  destinations: OrderedDestination[];
  legs: ItineraryLeg[];
  totals: ItineraryTotals;
  day_totals: DayTotal[];
  excluded_destinations: string[];
  notes: string[];
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

export const ITINERARY_RESULT_STORAGE_KEY = "msj.itinerary.result";
