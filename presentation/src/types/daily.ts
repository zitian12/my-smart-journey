import type { PublicUserProfile } from "./itinerary";

export type DailyKind = "photo" | "text" | "trip";

export type DailyTripSnapshot = {
  id: string;
  name: string;
  location: string;
  date: string;
  days: number;
  image: string;
};

export type DailyItem = {
  id: string;
  kind?: DailyKind;
  image_url: string;
  caption: string;
  trip?: DailyTripSnapshot | null;
  created_at?: string | null;
  expires_at?: string | null;
};

export type DailyGroup = {
  user: PublicUserProfile;
  items: DailyItem[];
};

export type DailyFeed = {
  me: DailyGroup;
  friends: DailyGroup[];
};

export type DailyHistory = {
  items: DailyItem[];
};

export function dailyKind(item: DailyItem): DailyKind {
  if (item.kind === "text" || item.kind === "trip" || item.kind === "photo") {
    return item.kind;
  }
  return item.image_url ? "photo" : "text";
}
