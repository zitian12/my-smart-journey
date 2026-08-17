import type { FriendShares, TripShareItem } from "../types/connection";
import type { SavedItinerarySummary } from "../types/itinerary";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export class TripShareApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "TripShareApiError";
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
  if (typeof error.detail === "string") return error.detail;
  return fallback;
}

async function ensureOk(response: Response, fallback: string): Promise<void> {
  if (response.ok) return;
  throw new TripShareApiError(await readError(response, fallback), response.status);
}

export async function listSharedItineraries(
  token: string,
): Promise<SavedItinerarySummary[]> {
  const response = await fetch(`${API_URL}/api/itineraries/shared`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await ensureOk(response, "Failed to load shared trips");
  return response.json();
}

export async function listPendingTripShares(
  token: string,
): Promise<TripShareItem[]> {
  const response = await fetch(`${API_URL}/api/itineraries/shared/pending`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await ensureOk(response, "Failed to load trip invites");
  return response.json();
}

export async function listSharesWithFriend(
  token: string,
  userId: string,
): Promise<FriendShares> {
  const response = await fetch(
    `${API_URL}/api/itineraries/shared/with/${userId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  await ensureOk(response, "Failed to load shared trips");
  return response.json();
}

export async function listItineraryShares(
  token: string,
  itineraryId: string,
): Promise<TripShareItem[]> {
  const response = await fetch(
    `${API_URL}/api/itineraries/${itineraryId}/shares`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  await ensureOk(response, "Failed to load trip shares");
  return response.json();
}

export async function inviteFriendToTrip(
  token: string,
  itineraryId: string,
  userId: string,
): Promise<TripShareItem> {
  const response = await fetch(
    `${API_URL}/api/itineraries/${itineraryId}/shares`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ user_id: userId }),
    },
  );
  await ensureOk(response, "Failed to invite friend");
  return response.json();
}

export async function revokeTripShare(
  token: string,
  itineraryId: string,
  userId: string,
): Promise<void> {
  const response = await fetch(
    `${API_URL}/api/itineraries/${itineraryId}/shares/${userId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  await ensureOk(response, "Failed to revoke share");
}

export async function acceptTripShare(
  token: string,
  shareId: string,
): Promise<TripShareItem> {
  const response = await fetch(`${API_URL}/api/trip-shares/${shareId}/accept`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  await ensureOk(response, "Failed to accept trip invite");
  return response.json();
}

export async function declineTripShare(
  token: string,
  shareId: string,
): Promise<TripShareItem> {
  const response = await fetch(`${API_URL}/api/trip-shares/${shareId}/decline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  await ensureOk(response, "Failed to decline trip invite");
  return response.json();
}
