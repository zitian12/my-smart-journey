const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(
  /\/$/,
  "",
);

/** Resolve API-relative media paths so <img> can load from the backend. */
export function mediaUrl(url?: string | null): string {
  if (!url) return "";
  if (
    /^https?:\/\//i.test(url) ||
    url.startsWith("blob:") ||
    url.startsWith("data:")
  ) {
    return url;
  }
  return `${API_URL}${url.startsWith("/") ? url : `/${url}`}`;
}
