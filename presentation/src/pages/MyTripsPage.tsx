import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  deleteItinerary,
  getItinerary,
  listItineraries,
  renameItinerary,
  setItineraryFavourite,
} from "../services/itineraryApi";
import type { SavedItinerarySummary } from "../types/itinerary";
import { ITINERARY_RESULT_STORAGE_KEY } from "../types/itinerary";

type FilterMode = "all" | "favourites";

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

function IconEdit() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m16.5 5.5 2 2M4 20h4l10.5-10.5a1.4 1.4 0 0 0-2-2L4 16v4Z"
      />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V7h10Z" />
    </svg>
  );
}

function IconRename() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 20h6l10-10-6-6L4 14v6ZM14 6l4 4"
      />
    </svg>
  );
}

function IconLeaf() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
      <path d="M17 3C10.5 3 5.2 7.4 4 13.5 8.5 12.5 12.5 9 14.5 5.5 15.5 7.5 16 9.5 16 11.5c0 4-3 7.5-7 8.5 1.5 1 3.3 1.5 5 1.5 5.5 0 10-4.5 10-10S22.5 3 17 3Z" />
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

type TripCardProps = {
  trip: SavedItinerarySummary;
  busy: boolean;
  onOpen: (trip: SavedItinerarySummary) => void;
  onViewEcoScore: (trip: SavedItinerarySummary) => void;
  onToggleFavourite: (trip: SavedItinerarySummary) => void;
  onRename: (trip: SavedItinerarySummary) => void;
  onDelete: (trip: SavedItinerarySummary) => void;
};

function tripDateKey(trip: SavedItinerarySummary): string | null {
  const raw = trip.created_at;
  if (!raw) return null;
  return raw.slice(0, 10);
}

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
  onOpen,
  onViewEcoScore,
  onToggleFavourite,
  onRename,
  onDelete,
}: TripCardProps) {
  const statusLabel = trip.status === "upcoming" ? "Upcoming" : "Completed";

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

          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Favourite"
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
            <button
              type="button"
              aria-label="Rename trip"
              disabled={busy}
              onClick={() => onRename(trip)}
              className="rounded-lg p-1.5 text-stone transition hover:bg-mist hover:text-forest"
            >
              <IconRename />
            </button>
            <button
              type="button"
              aria-label="Open trip"
              disabled={busy}
              onClick={() => onOpen(trip)}
              className="rounded-lg p-1.5 text-stone transition hover:bg-mist hover:text-forest"
            >
              <IconEdit />
            </button>
            <button
              type="button"
              aria-label="Delete trip"
              disabled={busy}
              onClick={() => onDelete(trip)}
              className="rounded-lg p-1.5 text-red-400 transition hover:bg-red-50 hover:text-red-500"
            >
              <IconTrash />
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onOpen(trip)}
          disabled={busy}
          className="text-left"
        >
          <h2 className="text-lg font-semibold text-ink sm:text-xl">{trip.name}</h2>
        </button>

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
  const [filter, setFilter] = useState<FilterMode>("all");
  const [destinationQuery, setDestinationQuery] = useState("");
  const [durationDays, setDurationDays] = useState<number | "any">("any");
  const [createdOn, setCreatedOn] = useState("");
  const [trips, setTrips] = useState<SavedItinerarySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renamingTrip, setRenamingTrip] = useState<SavedItinerarySummary | null>(
    null,
  );
  const [renameName, setRenameName] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);

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
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await listItineraries(token);
      setTrips(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trips");
      setTrips([]);
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    void loadTrips();
  }, [loadTrips, isAuthenticated]);

  const durationOptions = useMemo(() => {
    const unique = new Set(trips.map((trip) => trip.days));
    return [...unique].sort((a, b) => a - b);
  }, [trips]);

  const hasExtraFilters =
    destinationQuery.trim().length > 0 ||
    durationDays !== "any" ||
    createdOn !== "";

  const visibleTrips = useMemo(
    () =>
      trips.filter((trip) => {
        if (filter === "favourites" && !trip.is_favourite) return false;
        if (!matchesDestination(trip, destinationQuery)) return false;
        if (durationDays !== "any" && trip.days !== durationDays) return false;
        if (createdOn && tripDateKey(trip) !== createdOn) return false;
        return true;
      }),
    [createdOn, destinationQuery, durationDays, filter, trips],
  );

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
      const state = {
        itinerary: detail.itinerary,
        places: detail.places,
      };
      sessionStorage.setItem(ITINERARY_RESULT_STORAGE_KEY, JSON.stringify(state));
      navigate("/dashboard/planning/result", { state });
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
          onClick={() => navigate("/dashboard/planning")}
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
          onClick={() => navigate("/dashboard/planning")}
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

        {error ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
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
          {filter === "favourites" || hasExtraFilters ? (
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
                onOpen={(item) => void onOpen(item)}
                onViewEcoScore={(item) =>
                  navigate(`/dashboard/eco-score?trip=${item.id}`)
                }
                onToggleFavourite={(item) => void onToggleFavourite(item)}
                onRename={openRename}
                onDelete={(item) => void onDelete(item)}
              />
            ))
          ) : (
            <p className="rounded-2xl bg-white p-8 text-center text-sm text-stone ring-1 ring-forest/5">
              {trips.length === 0
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
