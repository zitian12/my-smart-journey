import type { DailyFeed, DailyHistory, DailyItem } from "../types/daily";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export class DailyApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "DailyApiError";
    this.status = status;
  }
}

async function readError(response: Response, fallback: string): Promise<string> {
  const error = await response.json().catch(() => ({ detail: fallback }));
  if (typeof error.detail === "string") return error.detail;
  return fallback;
}

async function ensureOk(response: Response, fallback: string): Promise<void> {
  if (response.ok) return;
  throw new DailyApiError(await readError(response, fallback), response.status);
}

export async function listDailies(token: string): Promise<DailyFeed> {
  const response = await fetch(`${API_URL}/api/dailies`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await ensureOk(response, "Failed to load dailies");
  return response.json();
}

export async function listDailyHistory(token: string): Promise<DailyHistory> {
  const response = await fetch(`${API_URL}/api/dailies/history`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await ensureOk(response, "Failed to load daily history");
  return response.json();
}

export async function createDaily(
  token: string,
  payload: {
    kind: "photo" | "text" | "trip";
    caption: string;
    file?: File | null;
    itineraryId?: string | null;
  },
): Promise<DailyItem> {
  const formData = new FormData();
  formData.append("kind", payload.kind);
  formData.append("caption", payload.caption);
  if (payload.file) {
    formData.append("file", payload.file);
  }
  if (payload.itineraryId) {
    formData.append("itinerary_id", payload.itineraryId);
  }

  const response = await fetch(`${API_URL}/api/dailies`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  await ensureOk(response, "Failed to post daily");
  return response.json();
}

export async function deleteDaily(token: string, dailyId: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/dailies/${dailyId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  await ensureOk(response, "Failed to delete daily");
}
