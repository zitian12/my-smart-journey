import type { PublicUserProfile, SavedItinerarySummary } from "./itinerary";

export type ConnectionStatus = "pending" | "accepted" | "declined";
export type ConnectionDirection = "incoming" | "outgoing";

export type ConnectionItem = {
  id: string;
  status: ConnectionStatus;
  direction: ConnectionDirection;
  user: PublicUserProfile;
  created_at?: string | null;
};

export type PendingConnections = {
  incoming: ConnectionItem[];
  outgoing: ConnectionItem[];
};

export type TripShareItem = {
  id: string;
  itinerary_id: string;
  status: ConnectionStatus;
  user: PublicUserProfile;
  itinerary?: SavedItinerarySummary | null;
  created_at?: string | null;
};

export type FriendShares = {
  from_friend: TripShareItem[];
  to_friend: TripShareItem[];
};

export type UserRelationship =
  | "none"
  | "pending_out"
  | "pending_in"
  | "friends";

export type UserSearchResult = {
  user: PublicUserProfile;
  relationship: UserRelationship;
  connection_id?: string | null;
};
