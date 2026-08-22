const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export type AddressSuggestion = {
  id?: string;
  name: string;
  latitude: number;
  longitude: number;
  subtitle?: string;
};

export async function fetchAddressSuggestions(
  q: string,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> {
  const query = q.trim();
  if (query.length < 3) return [];
  const params = new URLSearchParams({ q: query });
  const response = await fetch(`${API_URL}/api/geocode/suggest?${params}`, {
    signal,
  });
  if (!response.ok) return [];
  return response.json();
}

/** Reverse-geocode GPS coords via OSM Photon (no Google). Null if unlabeled. */
export async function fetchCurrentAddress(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<AddressSuggestion | null> {
  const params = new URLSearchParams({
    lat: String(latitude),
    lng: String(longitude),
  });
  const response = await fetch(`${API_URL}/api/geocode/reverse?${params}`, {
    signal,
  });
  if (response.status === 404) return null;
  if (!response.ok) return null;
  return response.json();
}
