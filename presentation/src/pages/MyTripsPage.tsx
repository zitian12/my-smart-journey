import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { usePendingCounts } from "../context/PendingCountsContext";
import {
  deleteItinerary,
  duplicateItinerary,
  getItinerary,
  listItineraries,
  renameItinerary,
  setItineraryFavourite,
} from "../services/itineraryApi";
import { listFriends } from "../services/connectionApi";
import {
  acceptTripShare,
  declineTripShare,
  inviteFriendToTrip,
  listItineraryShares,
  listPendingTripShares,
  listSharedItineraries,
  revokeTripShare,
} from "../services/tripShareApi";
import type { ConnectionItem, TripShareItem } from "../types/connection";
import type { SavedItinerarySummary } from "../types/itinerary";
import { ITINERARY_RESULT_STORAGE_KEY } from "../types/itinerary";

type FilterMode = "all" | "favourites" | "shared";

function IconSparkle() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
      <path d="M12 3.5 13.6 9l5.4 1.6-5.4 1.6L12 17.8l-1.6-5.6L5 10.6 10.4 9 12 3.5Z" />
    </svg>
  );
}

function IconHeart({ filled }: { filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 21s-6.7-4.4-9-8.2C1.2 8.8 3.6 5 7.5 5c2.1 0 3.4 1.1 4.5 2.2C13.1 6.1 14.4 5 16.5 5c3.9 0 6.3 3.8 4.5 7.8C18.7 16.6 12 21 12 21Z"
      />
    </svg>
  );
}

function IconLeaf() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 4 18 2 22 2c0 4-2 6.5-4.1 12.2A7 7 0 0 1 11 20z" />
      <path d="M2 22c0-3 1.9-5.4 5.1-6C9.5 15.5 12 14 13 13" />
    </svg>
  );
}

function IconPin() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z" />
      <circle cx="12" cy="11" r="2" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path strokeLinecap="round" d="M8 3v4M16 3v4M4 10h16" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8" />
      <path strokeLinecap="round" d="M12 8v4l3 2" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="8" r="3" />
      <path strokeLinecap="round" d="M3 19c0-3 2.7-5 6-5s6 2 6 5M16 8a2.5 2.5 0 1 1 0 5M19 19c0-2.2-1.6-4-3.5-4.5" />
    </svg>
  );
}

function IconSun() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="4" />
      <path strokeLinecap="round" d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.5 17.5l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.5 6.5l1.4-1.4" />
    </svg>
  );
}

function IconRouteStart() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-leaf" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12l7.5-7.5M3 12h18" />
    </svg>
  );
}

function IconRouteEnd() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-leaf" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 21V4m0 0h9l-1.5 3L14 10H5" />
    </svg>
  );
}

function tripDateKey(trip: SavedItinerarySummary): string | null {
  const raw = trip.created_at;
  if (!raw) return null;
  return raw.slice(0, 10);
}

type TripCardProps = {
  trip: SavedItinerarySummary;
  busy: boolean;
  readOnly?: boolean;
  sharedByName?: string;
  onOpen: (trip: SavedItinerarySummary) => void;
  onViewEcoScore: (trip: SavedItinerarySummary) => void;
  onToggleFavourite: (trip: SavedItinerarySummary) => void;
  onRename: (trip: SavedItinerarySummary) => void;
  onDuplicate: (trip: SavedItinerarySummary) => void;
  onDelete: (trip: SavedItinerarySummary) => void;
  onInvite?: (trip: SavedItinerarySummary) => void;
};

function matchesDestination(trip: SavedItinerarySummary, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    trip.location,
    trip.start_point,
    trip.end_point,
    trip.name,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

function TripCard({
  trip,
  busy,
  readOnly,
  sharedByName,
  onOpen,
  onViewEcoScore,
  onToggleFavourite,
  onRename,
  onDuplicate,
  onDelete,
  onInvite,
}: TripCardProps) {
  const statusLabel = trip.status === "upcoming" ? "Upcoming" : "Completed";
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const runAction = (action: () => void) => {
    setMenuOpen(false);
    action();
  };

  return (
    <article className="flex gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-forest/5 sm:gap-5 sm:p-5">
      <button
        type="button"
        onClick={() => onOpen(trip)}
        disabled={busy}
        className="h-28 w-28 shrink-0 overflow-hidden rounded-xl sm:h-32 sm:w-36"
      >
        <img
          src={trip.image}
          alt={trip.name}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      </button>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={[
                "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                trip.status === "upcoming"
                  ? "bg-sky-100 text-sky-700"
                  : "bg-stone/10 text-stone",
              ].join(" ")}
            >
              {statusLabel}
            </span>
            <button
              type="button"
              onClick={() => onViewEcoScore(trip)}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-full bg-leaf/10 px-2.5 py-0.5 text-xs font-semibold text-leaf transition hover:bg-leaf/20 disabled:opacity-50"
              aria-label={`View eco score ${trip.eco_score}`}
            >
              <IconLeaf />
              {trip.eco_score}
            </button>
          </div>

          {readOnly ? null : (
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label={trip.is_favourite ? "Unfavourite" : "Favourite"}
                disabled={busy}
                onClick={() => onToggleFavourite(trip)}
                className={[
                  "rounded-lg p-1.5 transition hover:bg-mist",
                  trip.is_favourite
                    ? "text-red-500 hover:text-red-600"
                    : "text-stone hover:text-forest",
                ].join(" ")}
              >
                <IconHeart filled={trip.is_favourite} />
              </button>
              <div ref={menuRef} className="relative" onClick={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  disabled={busy}
                  onClick={() => setMenuOpen((open) => !open)}
                  className="rounded-lg px-2.5 py-1 text-sm font-medium text-stone transition hover:bg-mist hover:text-forest disabled:opacity-50"
                >
                  Options
                </button>
                {menuOpen ? (
                  <div
                    role="menu"
                    className="absolute right-0 z-20 mt-1 min-w-[9.5rem] overflow-hidden rounded-xl bg-white py-1 shadow-lg ring-1 ring-forest/10"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      disabled={busy}
                      onClick={() => runAction(() => onInvite?.(trip))}
                      className="block w-full px-3 py-2 text-left text-sm text-ink transition hover:bg-mist disabled:opacity-50"
                    >
                      Invite
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={busy}
                      onClick={() => runAction(() => onRename(trip))}
                      className="block w-full px-3 py-2 text-left text-sm text-ink transition hover:bg-mist disabled:opacity-50"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={busy}
                      onClick={() => runAction(() => onDuplicate(trip))}
                      className="block w-full px-3 py-2 text-left text-sm text-ink transition hover:bg-mist disabled:opacity-50"
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={busy}
                      onClick={() => runAction(() => onDelete(trip))}
                      className="block w-full px-3 py-2 text-left text-sm text-red-500 transition hover:bg-red-50 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => onOpen(trip)}
          disabled={busy}
          className="text-left"
        >
          <h2 className="text-lg font-semibold text-ink sm:text-xl">{trip.name}</h2>
        </button>
        {sharedByName ? (
          <p className="text-xs font-medium text-leaf">Shared by {sharedByName}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-stone">
          <span className="inline-flex items-center gap-1">
            <IconRouteStart />
            {trip.start_point}
          </span>
          <span className="text-stone/50" aria-hidden>
            →
          </span>
          <span className="inline-flex items-center gap-1">
            <IconRouteEnd />
            {trip.end_point}
          </span>
        </div>

        <p className="inline-flex items-center gap-1.5 text-sm text-stone">
          <IconPin />
          {trip.location}
        </p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone sm:text-sm">
          <span className="inline-flex items-center gap-1.5">
            <IconCalendar />
            {trip.date}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <IconClock />
            {trip.days}d {trip.nights}n
          </span>
          <span className="inline-flex items-center gap-1.5">
            <IconUsers />
            {trip.travelers} traveler{trip.travelers === 1 ? "" : "s"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <IconSun />
            {trip.hours_per_day}h/day
          </span>
        </div>
      </div>
    </article>
  );
}

export function MyTripsPage() {
  const navigate = useNavigate();
  const { isAuthenticated, getAccessToken } = useAuth();
  const { refreshPending } = usePendingCounts();
  const [filter, setFilter] = useState<FilterMode>("all");
  const [destinationQuery, setDestinationQuery] = useState("");
  const [durationDays, setDurationDays] = useState<number | "any">("any");
  const [createdOn, setCreatedOn] = useState("");
  const [trips, setTrips] = useState<SavedItinerarySummary[]>([]);
  const [sharedTrips, setSharedTrips] = useState<SavedItinerarySummary[]>([]);
  const [pendingInvites, setPendingInvites] = useState<TripShareItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renamingTrip, setRenamingTrip] = useState<SavedItinerarySummary | null>(
    null,
  );
  const [renameName, setRenameName] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [invitingTrip, setInvitingTrip] = useState<SavedItinerarySummary | null>(
    null,
  );
  const [friends, setFriends] = useState<ConnectionItem[]>([]);
  const [tripShares, setTripShares] = useState<TripShareItem[]>([]);
  const [inviteBusyId, setInviteBusyId] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    [],
  );

  const loadTrips = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setTrips([]);
      setSharedTrips([]);
      setPendingInvites([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [owned, shared, pending] = await Promise.all([
        listItineraries(token),
        listSharedItineraries(token),
        listPendingTripShares(token),
      ]);
      setTrips(owned);
      setSharedTrips(shared);
      setPendingInvites(pending);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trips");
      setTrips([]);
      setSharedTrips([]);
      setPendingInvites([]);
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    void loadTrips();
  }, [loadTrips, isAuthenticated]);

  const durationOptions = useMemo(() => {
    const source = filter === "shared" ? sharedTrips : trips;
    const unique = new Set(source.map((trip) => trip.days));
    return [...unique].sort((a, b) => a - b);
  }, [filter, sharedTrips, trips]);

  const hasExtraFilters =
    destinationQuery.trim().length > 0 ||
    durationDays !== "any" ||
    createdOn !== "";

  const visibleTrips = useMemo(() => {
    const source = filter === "shared" ? sharedTrips : trips;
    return source.filter((trip) => {
      if (filter === "favourites" && !trip.is_favourite) return false;
      if (!matchesDestination(trip, destinationQuery)) return false;
      if (durationDays !== "any" && trip.days !== durationDays) return false;
      if (createdOn && tripDateKey(trip) !== createdOn) return false;
      return true;
    });
  }, [createdOn, destinationQuery, durationDays, filter, sharedTrips, trips]);

  const onOpen = async (trip: SavedItinerarySummary) => {
    const token = getAccessToken();
    if (!token) {
      setError("Please sign in to open this trip.");
      return;
    }
    setBusyId(trip.id);
    setError(null);
    try {
      const detail = await getItinerary(token, trip.id);
      const sharedBy = detail.shared_by;
      const state = {
        itinerary: detail.itinerary,
        places: detail.places,
        readOnly: Boolean(detail.is_read_only),
        sharedByName: sharedBy
          ? sharedBy.nickname.trim() || sharedBy.full_name || sharedBy.email
          : undefined,
        ...(detail.is_read_only
          ? {}
          : {
              savedItineraryId: detail.id,
              savedTripName: detail.name,
            }),
      };
      sessionStorage.setItem(ITINERARY_RESULT_STORAGE_KEY, JSON.stringify(state));
      navigate("/planning/result", { state });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open trip");
    } finally {
      setBusyId(null);
    }
  };

  const onToggleFavourite = async (trip: SavedItinerarySummary) => {
    const token = getAccessToken();
    if (!token) {
      setError("Please sign in to update favourites.");
      return;
    }
    setBusyId(trip.id);
    setError(null);
    try {
      const updated = await setItineraryFavourite(
        token,
        trip.id,
        !trip.is_favourite,
      );
      setTrips((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update favourite");
    } finally {
      setBusyId(null);
    }
  };

  const onDuplicate = async (trip: SavedItinerarySummary) => {
    const token = getAccessToken();
    if (!token) {
      setError("Please sign in to duplicate this trip.");
      return;
    }
    setBusyId(trip.id);
    setError(null);
    try {
      const copy = await duplicateItinerary(token, trip.id);
      setTrips((prev) => [copy, ...prev]);
      openRename(copy);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to duplicate trip");
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (trip: SavedItinerarySummary) => {
    if (!window.confirm(`Delete "${trip.name}"? This cannot be undone.`)) {
      return;
    }
    const token = getAccessToken();
    if (!token) {
      setError("Please sign in to delete this trip.");
      return;
    }
    setBusyId(trip.id);
    setError(null);
    try {
      await deleteItinerary(token, trip.id);
      setTrips((prev) => prev.filter((item) => item.id !== trip.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete trip");
    } finally {
      setBusyId(null);
    }
  };

  const friendName = (item: ConnectionItem | TripShareItem) =>
    item.user.nickname.trim() || item.user.full_name || item.user.email;

  const openInvite = async (trip: SavedItinerarySummary) => {
    const token = getAccessToken();
    if (!token) {
      setError("Please sign in to invite friends.");
      return;
    }
    setInvitingTrip(trip);
    setInviteError(null);
    setFriends([]);
    setTripShares([]);
    try {
      const [friendRows, shareRows] = await Promise.all([
        listFriends(token),
        listItineraryShares(token, trip.id),
      ]);
      setFriends(friendRows);
      setTripShares(shareRows);
    } catch (err) {
      setInviteError(
        err instanceof Error ? err.message : "Failed to load friends",
      );
    }
  };

  const onInviteFriend = async (friend: ConnectionItem) => {
    if (!invitingTrip) return;
    const token = getAccessToken();
    if (!token) return;
    setInviteBusyId(friend.user.id);
    setInviteError(null);
    try {
      const created = await inviteFriendToTrip(
        token,
        invitingTrip.id,
        friend.user.id,
      );
      setTripShares((prev) => [
        created,
        ...prev.filter((item) => item.user.id !== friend.user.id),
      ]);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to invite");
    } finally {
      setInviteBusyId(null);
    }
  };

  const onRevokeShare = async (share: TripShareItem) => {
    if (!invitingTrip) return;
    const token = getAccessToken();
    if (!token) return;
    setInviteBusyId(share.user.id);
    setInviteError(null);
    try {
      await revokeTripShare(token, invitingTrip.id, share.user.id);
      setTripShares((prev) => prev.filter((item) => item.id !== share.id));
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to revoke");
    } finally {
      setInviteBusyId(null);
    }
  };

  const onAcceptInvite = async (share: TripShareItem) => {
    const token = getAccessToken();
    if (!token) return;
    setBusyId(share.id);
    setError(null);
    try {
      await acceptTripShare(token, share.id);
      await loadTrips();
      await refreshPending();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept invite");
    } finally {
      setBusyId(null);
    }
  };

  const onDeclineInvite = async (share: TripShareItem) => {
    const token = getAccessToken();
    if (!token) return;
    setBusyId(share.id);
    setError(null);
    try {
      await declineTripShare(token, share.id);
      setPendingInvites((prev) => prev.filter((item) => item.id !== share.id));
      await refreshPending();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to decline invite");
    } finally {
      setBusyId(null);
    }
  };

  const openRename = (trip: SavedItinerarySummary) => {
    setError(null);
    setRenamingTrip(trip);
    setRenameName(trip.name);
  };

  const onConfirmRename = async () => {
    if (!renamingTrip || renameBusy) return;
    const nextName = renameName.trim();
    if (!nextName) {
      setError("Trip name cannot be empty.");
      return;
    }
    const nameTaken = trips.some(
      (item) =>
        item.id !== renamingTrip.id &&
        item.name.trim().toLowerCase() === nextName.toLowerCase(),
    );
    if (nameTaken) {
      setError(
        "A trip with this name already exists. Please choose a different name.",
      );
      return;
    }
    const token = getAccessToken();
    if (!token) {
      setError("Please sign in to rename this trip.");
      return;
    }
    setRenameBusy(true);
    setBusyId(renamingTrip.id);
    setError(null);
    try {
      const updated = await renameItinerary(token, renamingTrip.id, nextName);
      setTrips((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item)),
      );
      setRenamingTrip(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename trip");
    } finally {
      setRenameBusy(false);
      setBusyId(null);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-xl animate-fade-up rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-forest/5">
        <h1 className="font-display text-2xl font-semibold text-forest">
          My Trips
        </h1>
        <p className="mt-2 text-sm text-stone">
          Sign in from the sidebar to view and manage your saved itineraries.
        </p>
        <button
          type="button"
          onClick={() => navigate("/planning")}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600"
        >
          <IconSparkle />
          Plan a Trip
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl animate-fade-up space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-forest sm:text-4xl">
            My Trips
          </h1>
          <p className="mt-1 text-sm text-stone">{todayLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/planning")}
          className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600"
        >
          <IconSparkle />
          Plan a Trip
        </button>
      </header>

      <section className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-ink">My Trips</h2>
            <p className="mt-0.5 text-sm text-stone">
              {loading
                ? "Loading itineraries…"
                : filter === "shared"
                  ? `${sharedTrips.length} shared with you`
                  : `${trips.length} itineraries saved`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFilter("favourites")}
            className={[
              "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition",
              filter === "favourites"
                ? "bg-forest text-white"
                : "bg-white text-forest ring-1 ring-forest/10 hover:bg-mist",
            ].join(" ")}
          >
            <IconHeart filled={filter === "favourites"} />
            My Favourites
          </button>
        </div>

        {error && !renamingTrip ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {pendingInvites.length > 0 ? (
          <div className="space-y-3 rounded-2xl bg-white p-5 ring-1 ring-forest/10">
            <h3 className="text-base font-semibold text-ink">
              Trip invites ({pendingInvites.length})
            </h3>
            {pendingInvites.map((invite) => (
              <article
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-mist/50 px-3 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-ink">
                    {invite.itinerary?.name || "Shared trip"}
                  </p>
                  <p className="text-sm text-stone">From {friendName(invite)}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === invite.id}
                    onClick={() => void onAcceptInvite(invite)}
                    className="rounded-xl bg-forest px-3 py-2 text-sm font-semibold text-white transition hover:bg-leaf disabled:opacity-60"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    disabled={busyId === invite.id}
                    onClick={() => void onDeclineInvite(invite)}
                    className="rounded-xl px-3 py-2 text-sm font-medium text-stone ring-1 ring-forest/10 transition hover:bg-white disabled:opacity-60"
                  >
                    Decline
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {invitingTrip ? (
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-forest/10 sm:p-6">
            <h3 className="text-base font-semibold text-ink">
              Invite friends to “{invitingTrip.name}”
            </h3>
            <p className="mt-1 text-sm text-stone">
              They can view this trip after accepting. Editing stays with you.
            </p>
            {inviteError ? (
              <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                {inviteError}
              </p>
            ) : null}
            {friends.length === 0 ? (
              <p className="mt-4 text-sm text-stone">
                No friends yet. Add someone on the Friends page first.
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {friends.map((friend) => {
                  const share = tripShares.find(
                    (item) => item.user.id === friend.user.id,
                  );
                  const status = share?.status;
                  return (
                    <li
                      key={friend.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-mist/40 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">
                          {friendName(friend)}
                        </p>
                        <p className="truncate text-xs text-stone">
                          {friend.user.email}
                          {status === "pending" ? " · invite pending" : ""}
                          {status === "accepted" ? " · can view" : ""}
                        </p>
                      </div>
                      {status === "accepted" || status === "pending" ? (
                        <button
                          type="button"
                          disabled={inviteBusyId === friend.user.id}
                          onClick={() => share && void onRevokeShare(share)}
                          className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 ring-1 ring-red-200 transition hover:bg-red-50 disabled:opacity-60"
                        >
                          Revoke
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={inviteBusyId === friend.user.id}
                          onClick={() => void onInviteFriend(friend)}
                          className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60"
                        >
                          Invite
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setInvitingTrip(null)}
              className="mt-4 rounded-xl px-4 py-2.5 text-sm font-medium text-stone ring-1 ring-forest/10 transition hover:bg-mist"
            >
              Done
            </button>
          </div>
        ) : null}

        {renamingTrip ? (
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-forest/10 sm:p-6">
            <h3 className="text-base font-semibold text-ink">Rename this trip</h3>
            <p className="mt-1 text-sm text-stone">
              Update the name shown in My Trips.
            </p>
            <label className="mt-4 block text-sm font-medium text-forest">
              Trip name
              <input
                type="text"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                maxLength={120}
                disabled={renameBusy}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-mist/40 px-3 py-2.5 text-sm text-ink outline-none ring-forest/20 focus:ring-2"
              />
            </label>
            {error ? (
              <p className="mt-2 text-sm text-red-700">{error}</p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void onConfirmRename()}
                disabled={renameBusy || !renameName.trim()}
                className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {renameBusy ? "Saving…" : "Confirm rename"}
              </button>
              <button
                type="button"
                onClick={() => setRenamingTrip(null)}
                disabled={renameBusy}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-stone ring-1 ring-forest/10 transition hover:bg-mist"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 ring-1 ring-forest/5">
          <label className="min-w-[12rem] flex-1 text-xs font-medium text-forest">
            Destination
            <input
              type="search"
              value={destinationQuery}
              onChange={(e) => setDestinationQuery(e.target.value)}
              placeholder="Search place, start, or end"
              className="mt-1.5 w-full rounded-xl border border-forest/10 bg-mist/40 px-3 py-2 text-sm text-ink outline-none ring-forest/20 focus:ring-2"
            />
          </label>
          <label className="text-xs font-medium text-forest">
            Duration
            <select
              value={durationDays === "any" ? "any" : String(durationDays)}
              onChange={(e) =>
                setDurationDays(
                  e.target.value === "any" ? "any" : Number(e.target.value),
                )
              }
              className="mt-1.5 block rounded-xl border border-forest/10 bg-mist/40 px-3 py-2 text-sm text-ink outline-none ring-forest/20 focus:ring-2"
            >
              <option value="any">Any</option>
              {durationOptions.map((days) => (
                <option key={days} value={days}>
                  {days} day{days === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-forest">
            Created on
            <input
              type="date"
              value={createdOn}
              onChange={(e) => setCreatedOn(e.target.value)}
              className="mt-1.5 block rounded-xl border border-forest/10 bg-mist/40 px-3 py-2 text-sm text-ink outline-none ring-forest/20 focus:ring-2"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={[
              "rounded-full px-4 py-1.5 text-sm font-semibold transition",
              filter === "all"
                ? "bg-forest text-white"
                : "bg-white text-forest ring-1 ring-forest/10 hover:bg-mist",
            ].join(" ")}
          >
            All ({trips.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("shared")}
            className={[
              "rounded-full px-4 py-1.5 text-sm font-semibold transition",
              filter === "shared"
                ? "bg-forest text-white"
                : "bg-white text-forest ring-1 ring-forest/10 hover:bg-mist",
            ].join(" ")}
          >
            Shared with me ({sharedTrips.length})
          </button>
          {filter === "favourites" || filter === "shared" || hasExtraFilters ? (
            <span className="text-sm text-stone">
              Showing {visibleTrips.length}
              {filter === "favourites" ? " favourite" : ""}
              {visibleTrips.length === 1 ? "" : filter === "favourites" ? "s" : ""}
            </span>
          ) : null}
        </div>

        <div className="space-y-4">
          {loading ? (
            <p className="rounded-2xl bg-white p-8 text-center text-sm text-stone ring-1 ring-forest/5">
              Loading your trips…
            </p>
          ) : visibleTrips.length > 0 ? (
            visibleTrips.map((trip) => (
              <TripCard
                key={trip.id}
                trip={trip}
                busy={busyId === trip.id}
                readOnly={filter === "shared"}
                sharedByName={
                  trip.shared_by
                    ? trip.shared_by.nickname.trim() ||
                      trip.shared_by.full_name ||
                      trip.shared_by.email
                    : undefined
                }
                onOpen={(item) => void onOpen(item)}
                onViewEcoScore={(item) =>
                  navigate(`/eco-score?trip=${item.id}`)
                }
                onToggleFavourite={(item) => void onToggleFavourite(item)}
                onRename={openRename}
                onDuplicate={(item) => void onDuplicate(item)}
                onDelete={(item) => void onDelete(item)}
                onInvite={(item) => void openInvite(item)}
              />
            ))
          ) : (
            <p className="rounded-2xl bg-white p-8 text-center text-sm text-stone ring-1 ring-forest/5">
              {filter === "shared"
                ? sharedTrips.length === 0
                  ? "No shared trips yet. When a friend invites you, accept it here."
                  : "No shared trips match these filters."
                : trips.length === 0
                  ? "No saved trips yet. Generate a plan and tap Save trip."
                  : filter === "favourites" && !hasExtraFilters
                    ? "No favourite trips yet. Mark trips as favourites to see them here."
                    : "No trips match these filters."}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
