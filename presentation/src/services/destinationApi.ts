import type {
  Destination,
  DestinationCategory,
  DestinationFilters,
} from "../types/destination";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function readError(response: Response, fallback: string): Promise<string> {
  const error = await response.json().catch(() => ({ detail: fallback }));
  return typeof error.detail === "string" ? error.detail : fallback;
}

export async function fetchDestinationCategories(): Promise<DestinationCategory[]> {
  const response = await fetch(`${API_URL}/api/destination-categories`);
  if (!response.ok) {
    throw new Error(await readError(response, "Failed to load categories"));
  }
  return response.json();
}

export async function fetchDestinations(
  filters: DestinationFilters = {},
): Promise<Destination[]> {
  const params = new URLSearchParams();
  if (filters.name?.trim()) {
    params.set("name", filters.name.trim());
  }
  if (filters.state?.trim()) {
    params.set("state", filters.state.trim());
  }
  if (filters.category?.trim()) {
    params.set("category", filters.category.trim());
  }

  const query = params.toString();
  const url = query
    ? `${API_URL}/api/destinations?${query}`
    : `${API_URL}/api/destinations`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(await readError(response, "Failed to load destinations"));
  }
  return response.json();
}

export async function fetchDestinationById(id: string): Promise<Destination> {
  const response = await fetch(`${API_URL}/api/destinations/${id}`);
  if (!response.ok) {
    throw new Error(await readError(response, "Destination not found"));
  }
  return response.json();
}

export async function enrichDestination(id: string): Promise<Destination> {
  const response = await fetch(`${API_URL}/api/destinations/${id}/enrich`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(await readError(response, "Failed to enrich destination"));
  }
  return response.json();
}
