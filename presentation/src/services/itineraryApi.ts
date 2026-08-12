import type {
  ItineraryGenerateRequest,
  ItineraryGenerateResponse,
  ItineraryRecomputeRequest,
} from "../types/itinerary";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function readError(response: Response, fallback: string): Promise<string> {
  const error = await response.json().catch(() => ({ detail: fallback }));
  if (typeof error.detail === "string") {
    return error.detail;
  }
  if (Array.isArray(error.detail)) {
    const parts = error.detail
      .map((item: { loc?: unknown[]; msg?: string }) => {
        const field = Array.isArray(item.loc)
          ? item.loc.filter((p) => p !== "body").join(".")
          : "";
        return field && item.msg ? `${field}: ${item.msg}` : item.msg;
      })
      .filter(Boolean);
    if (parts.length > 0) {
      return parts.join("; ");
    }
  }
  return fallback;
}

export async function generateItinerary(
  payload: ItineraryGenerateRequest,
): Promise<ItineraryGenerateResponse> {
  const response = await fetch(`${API_URL}/api/itineraries/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await readError(response, "Failed to generate itinerary"));
  }

  return response.json();
}

export async function recomputeItinerary(
  payload: ItineraryRecomputeRequest,
): Promise<ItineraryGenerateResponse> {
  const response = await fetch(`${API_URL}/api/itineraries/recompute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await readError(response, "Failed to update itinerary"));
  }

  return response.json();
}

