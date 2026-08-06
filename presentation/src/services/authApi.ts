import type { AuthResponse } from "../types/auth";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export async function authenticateWithGoogle(idToken: string): Promise<AuthResponse> {
  const response = await fetch(`${API_URL}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: idToken }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Authentication failed" }));
    throw new Error(error.detail ?? "Authentication failed");
  }

  return response.json();
}

export async function logoutFromServer(): Promise<void> {
  await fetch(`${API_URL}/auth/logout`, { method: "POST" });
}
