export type DestinationCategory = {
  id: string;
  name: string;
  slug: string;
  description: string;
  is_active: boolean;
};

export type Destination = {
  id: string;
  destination_name: string;
  description: string;
  category_id: string;
  category_name?: string | null;
  category_slug?: string | null;
  state: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  operating_hours: string;
  images: string[];
  source: string;
  place_id?: string | null;
  is_featured?: boolean;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export type DestinationFilters = {
  name?: string;
  state?: string;
  category?: string;
  page?: number;
  page_size?: number;
};

export type DestinationListResponse = {
  items: Destination[];
  total: number;
  page: number;
  page_size: number;
};
