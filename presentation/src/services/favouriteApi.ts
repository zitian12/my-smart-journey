import type { Destination } from "../types/destination";
import type {
  FavouriteFolder,
  FavouriteIds,
  FavouriteStatus,
} from "../types/favourite";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export class FavouriteApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "FavouriteApiError";
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
  throw new FavouriteApiError(await readError(response, fallback), response.status);
}

export async function listFavouriteIds(token: string): Promise<string[]> {
  const response = await fetch(`${API_URL}/api/favourites/ids`, {
    headers: authHeaders(token),
  });
  await ensureOk(response, "Failed to load favourite ids");
  const data = (await response.json()) as FavouriteIds;
  return data.destination_ids ?? [];
}

export async function listFavourites(token: string): Promise<Destination[]> {
  const response = await fetch(`${API_URL}/api/favourites`, {
    headers: authHeaders(token),
  });
  await ensureOk(response, "Failed to load favourites");
  return (await response.json()) as Destination[];
}

export async function addFavourite(
  token: string,
  destinationId: string,
): Promise<FavouriteStatus> {
  const response = await fetch(`${API_URL}/api/favourites/${destinationId}`, {
    method: "PUT",
    headers: authHeaders(token),
  });
  await ensureOk(response, "Failed to add favourite");
  return (await response.json()) as FavouriteStatus;
}

export async function removeFavourite(
  token: string,
  destinationId: string,
): Promise<FavouriteStatus> {
  const response = await fetch(`${API_URL}/api/favourites/${destinationId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  await ensureOk(response, "Failed to remove favourite");
  return (await response.json()) as FavouriteStatus;
}

export async function listFavouriteFolders(
  token: string,
): Promise<FavouriteFolder[]> {
  const response = await fetch(`${API_URL}/api/favourite-folders`, {
    headers: authHeaders(token),
  });
  await ensureOk(response, "Failed to load folders");
  return (await response.json()) as FavouriteFolder[];
}

export async function createFavouriteFolder(
  token: string,
  name: string,
): Promise<FavouriteFolder> {
  const response = await fetch(`${API_URL}/api/favourite-folders`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ name }),
  });
  await ensureOk(response, "Failed to create folder");
  return (await response.json()) as FavouriteFolder;
}

export async function renameFavouriteFolder(
  token: string,
  folderId: string,
  name: string,
): Promise<FavouriteFolder> {
  const response = await fetch(`${API_URL}/api/favourite-folders/${folderId}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ name }),
  });
  await ensureOk(response, "Failed to rename folder");
  return (await response.json()) as FavouriteFolder;
}

export async function deleteFavouriteFolder(
  token: string,
  folderId: string,
): Promise<void> {
  const response = await fetch(`${API_URL}/api/favourite-folders/${folderId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  await ensureOk(response, "Failed to delete folder");
}

export async function listFolderItems(
  token: string,
  folderId: string,
): Promise<Destination[]> {
  const response = await fetch(
    `${API_URL}/api/favourite-folders/${folderId}/items`,
    { headers: authHeaders(token) },
  );
  await ensureOk(response, "Failed to load folder items");
  return (await response.json()) as Destination[];
}

export async function addFolderItem(
  token: string,
  folderId: string,
  destinationId: string,
): Promise<FavouriteStatus> {
  const response = await fetch(
    `${API_URL}/api/favourite-folders/${folderId}/items/${destinationId}`,
    {
      method: "PUT",
      headers: authHeaders(token),
    },
  );
  await ensureOk(response, "Failed to add destination to folder");
  return (await response.json()) as FavouriteStatus;
}

export async function removeFolderItem(
  token: string,
  folderId: string,
  destinationId: string,
): Promise<void> {
  const response = await fetch(
    `${API_URL}/api/favourite-folders/${folderId}/items/${destinationId}`,
    {
      method: "DELETE",
      headers: authHeaders(token),
    },
  );
  await ensureOk(response, "Failed to remove destination from folder");
}
