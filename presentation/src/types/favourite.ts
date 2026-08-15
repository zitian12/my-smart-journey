import type { Destination } from "./destination";

export type FavouriteFolder = {
  id: string;
  name: string;
  item_count: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type FavouriteIds = {
  destination_ids: string[];
};

export type FavouriteStatus = {
  destination_id: string;
  is_favourite: boolean;
};

export type FavouriteDestination = Destination;
