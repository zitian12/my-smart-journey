import type {
  ConnectionItem,
  PendingConnections,
  UserSearchResult,
} from "../types/connection";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export class ConnectionApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ConnectionApiError";
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
  throw new ConnectionApiError(await readError(response, fallback), response.status);
}

export async function listFriends(token: string): Promise<ConnectionItem[]> {
  const response = await fetch(`${API_URL}/api/connections`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await ensureOk(response, "Failed to load friends");
  return response.json();
}

export async function listPendingConnections(
  token: string,
): Promise<PendingConnections> {
  const response = await fetch(`${API_URL}/api/connections/pending`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await ensureOk(response, "Failed to load friend requests");
  return response.json();
}

export async function searchUsers(
  token: string,
  query: string,
): Promise<UserSearchResult[]> {
  const params = new URLSearchParams({ q: query });
  const response = await fetch(`${API_URL}/users/search?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await ensureOk(response, "Failed to search users");
  const data = (await response.json()) as { items: UserSearchResult[] };
  return data.items;
}

export async function sendFriendRequest(
  token: string,
  userId: string,
): Promise<ConnectionItem> {
  const response = await fetch(`${API_URL}/api/connections`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ user_id: userId }),
  });
  await ensureOk(response, "Failed to send friend request");
  return response.json();
}

export async function acceptFriendRequest(
  token: string,
  connectionId: string,
): Promise<ConnectionItem> {
  const response = await fetch(
    `${API_URL}/api/connections/${connectionId}/accept`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  await ensureOk(response, "Failed to accept request");
  return response.json();
}

export async function declineFriendRequest(
  token: string,
  connectionId: string,
): Promise<ConnectionItem> {
  const response = await fetch(
    `${API_URL}/api/connections/${connectionId}/decline`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  await ensureOk(response, "Failed to decline request");
  return response.json();
}

export async function removeConnection(
  token: string,
  connectionId: string,
): Promise<void> {
  const response = await fetch(`${API_URL}/api/connections/${connectionId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  await ensureOk(response, "Failed to update connection");
}
