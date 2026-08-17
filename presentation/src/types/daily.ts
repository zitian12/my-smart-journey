import type { PublicUserProfile } from "./itinerary";

export type DailyItem = {
  id: string;
  image_url: string;
  caption: string;
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
