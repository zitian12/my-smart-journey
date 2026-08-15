/** Only show Google Places photo hosts — drop wiki/unsplash junk. */

const FALLBACK_IMAGE_PREFIX =
  "https://images.unsplash.com/photo-1596422846543-75c6fc197f07";

const UNTRUSTED = ["wikimedia.org", "wikipedia.org", "unsplash.com"];

export function isPlacesImageUrl(url: string): boolean {
  if (!url || url.includes(FALLBACK_IMAGE_PREFIX)) {
    return false;
  }
  const lower = url.toLowerCase();
  if (UNTRUSTED.some((host) => lower.includes(host))) {
    return false;
  }
  return (
    lower.includes("googleusercontent.com") ||
    lower.includes("places.googleapis.com") ||
    lower.includes("ggpht.com")
  );
}

export function realDestinationImages(images: string[] | null | undefined): string[] {
  if (!images?.length) {
    return [];
  }
  return images.filter((url) => url && isPlacesImageUrl(url));
}

const CATEGORY_PLACEHOLDER: Record<string, string> = {
  nature: "from-emerald-50 via-mist to-leaf/20",
  culture: "from-amber-50 via-mist to-orange-100/40",
  heritage: "from-stone-100 via-mist to-amber-100/50",
  adventure: "from-sky-50 via-mist to-cyan-100/40",
  shopping: "from-violet-50 via-mist to-fuchsia-100/30",
};

export function categoryPlaceholderClass(slug: string | null | undefined): string {
  const key = (slug || "").toLowerCase();
  return CATEGORY_PLACEHOLDER[key] ?? "from-mist via-white to-leaf/15";
}
