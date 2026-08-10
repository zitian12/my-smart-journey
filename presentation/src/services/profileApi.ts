import { mapApiUser, type ApiUser, type User } from "../types/auth";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export class ProfileApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ProfileApiError";
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
  throw new ProfileApiError(await readError(response, fallback), response.status);
}

export async function fetchMyProfile(token: string): Promise<User> {
  const response = await fetch(`${API_URL}/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  await ensureOk(response, "Failed to load profile");

  const data = (await response.json()) as ApiUser;
  return mapApiUser(data);
}

export async function updateMyProfile(
  token: string,
  payload: {
    full_name: string;
    nickname: string;
    bio: string;
    phone: string;
  },
): Promise<User> {
  const response = await fetch(`${API_URL}/users/me`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  await ensureOk(response, "Failed to update profile");

  const data = (await response.json()) as ApiUser;
  return mapApiUser(data);
}

export async function uploadMyAvatar(token: string, file: File): Promise<User> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_URL}/users/me/avatar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  await ensureOk(response, "Failed to upload avatar");

  const data = (await response.json()) as ApiUser;
  return mapApiUser(data);
}

export async function deleteMyAccount(token: string): Promise<void> {
  const response = await fetch(`${API_URL}/users/me`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  await ensureOk(response, "Failed to delete account");
}
