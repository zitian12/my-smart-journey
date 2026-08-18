import type {
  ItineraryGenerateRequest,
  ItineraryGenerateResponse,
  ItineraryRecomputeRequest,
  ItinerarySaveRequest,
  SavedItineraryDetail,
  SavedItinerarySummary,
} from "../types/itinerary";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export class ItineraryApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ItineraryApiError";
    this.status = status;
  }
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

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

async function ensureOk(response: Response, fallback: string): Promise<void> {
  if (response.ok) return;
  throw new ItineraryApiError(await readError(response, fallback), response.status);
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

export async function saveItinerary(
  token: string,
  payload: ItinerarySaveRequest,
): Promise<SavedItineraryDetail> {
  const response = await fetch(`${API_URL}/api/itineraries`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  await ensureOk(response, "Failed to save itinerary");
  return response.json();
}

export async function updateItinerary(
  token: string,
  itineraryId: string,
  payload: ItinerarySaveRequest,
): Promise<SavedItineraryDetail> {
  const response = await fetch(`${API_URL}/api/itineraries/${itineraryId}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  await ensureOk(response, "Failed to update trip");
  return response.json();
}

export async function listItineraries(
  token: string,
): Promise<SavedItinerarySummary[]> {
  const response = await fetch(`${API_URL}/api/itineraries`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  await ensureOk(response, "Failed to load trips");
  return response.json();
}

export async function getItinerary(
  token: string,
  itineraryId: string,
): Promise<SavedItineraryDetail> {
  const response = await fetch(`${API_URL}/api/itineraries/${itineraryId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  await ensureOk(response, "Failed to load trip");
  return response.json();
}

export async function deleteItinerary(
  token: string,
  itineraryId: string,
): Promise<void> {
  const response = await fetch(`${API_URL}/api/itineraries/${itineraryId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  await ensureOk(response, "Failed to delete trip");
}

export async function setItineraryFavourite(
  token: string,
  itineraryId: string,
  isFavourite: boolean,
): Promise<SavedItinerarySummary> {
  const response = await fetch(
    `${API_URL}/api/itineraries/${itineraryId}/favourite`,
    {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ is_favourite: isFavourite }),
    },
  );

  await ensureOk(response, "Failed to update favourite");
  return response.json();
}

export async function renameItinerary(
  token: string,
  itineraryId: string,
  name: string,
): Promise<SavedItinerarySummary> {
  const response = await fetch(`${API_URL}/api/itineraries/${itineraryId}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ name }),
  });

  await ensureOk(response, "Failed to rename trip");
  return response.json();
}

export async function duplicateItinerary(
  token: string,
  itineraryId: string,
): Promise<SavedItinerarySummary> {
  const response = await fetch(
    `${API_URL}/api/itineraries/${itineraryId}/duplicate`,
    {
      method: "POST",
      headers: authHeaders(token),
    },
  );

  await ensureOk(response, "Failed to duplicate trip");
  return response.json();
}
