import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { UserAvatar } from "../components/UserAvatar";
import { useAuth } from "../context/AuthContext";
import { getItinerary, listItineraries } from "../services/itineraryApi";
import type { SavedItinerarySummary } from "../types/itinerary";
import { ITINERARY_RESULT_STORAGE_KEY } from "../types/itinerary";

const quickActions = [
  {
    id: "planning",
    title: "Planning",
    description: "Build a sustainable itinerary.",
    to: "/dashboard/planning",
  },
  {
    id: "eco-score",
    title: "Eco Score",
    description: "Track trip carbon impact.",
    to: "/dashboard/eco-score",
  },
  {
    id: "my-trips",
    title: "My Trips",
    description: "Manage saved itineraries.",
    to: "/dashboard/my-trips",
  },
  {
    id: "friends",
    title: "Friends",
    description: "Connect and share trips.",
    to: "/dashboard/connections",
  },
  {
    id: "favourites",
    title: "Favourites",
    description: "Saved destinations.",
    to: "/dashboard/favourites",
  },
] as const;

function IconLeaf({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
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

function QuickActionIcon({ id }: { id: (typeof quickActions)[number]["id"] }) {
  const common = "h-4 w-4";
  if (id === "planning") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
      </svg>
    );
  }
  if (id === "eco-score") {
    return <IconLeaf className={common} />;
  }
  if (id === "my-trips") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18M3 12l4-4M3 12l4 4M21 12l-4-4M21 12l-4 4" />
      </svg>
    );
  }
  if (id === "friends") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <circle cx="9" cy="8" r="3" />
        <path strokeLinecap="round" d="M3 19c0-3 2.7-5 6-5s6 2 6 5M16 8a2.5 2.5 0 1 1 0 5M19 19c0-2.2-1.6-4-3.5-4.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 21s-6.7-4.4-9-8.2C1.2 8.8 3.6 5 7.5 5c2.1 0 3.4 1.1 4.5 2.2C13.1 6.1 14.4 5 16.5 5c3.9 0 6.3 3.8 4.5 7.8C18.7 16.6 12 21 12 21Z"
      />
    </svg>
  );
}

function SoftPanel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-forest/20 bg-white/70 px-5 py-7 text-sm text-stone">
      {children}
    </div>
  );
}

function tripSortKey(trip: SavedItinerarySummary): number {
  const raw = trip.created_at;
  if (!raw) return 0;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? time : 0;
}

function pickRecentTrips(trips: SavedItinerarySummary[]): SavedItinerarySummary[] {
  const upcoming = trips
    .filter((trip) => trip.status === "upcoming")
    .sort((a, b) => tripSortKey(b) - tripSortKey(a));
  if (upcoming.length >= 2) return upcoming.slice(0, 2);
  if (upcoming.length === 1) {
    const rest = trips
      .filter((trip) => trip.id !== upcoming[0].id)
      .sort((a, b) => tripSortKey(b) - tripSortKey(a));
    return [upcoming[0], ...rest.slice(0, 1)];
  }
  return [...trips].sort((a, b) => tripSortKey(b) - tripSortKey(a)).slice(0, 2);
}

export function DashboardPage() {
  const { user, isAuthenticated, getAccessToken } = useAuth();
  const navigate = useNavigate();
  const [trips, setTrips] = useState<SavedItinerarySummary[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [tripsError, setTripsError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const greetingName =
    isAuthenticated && user
      ? user.nickname.trim() || user.name.split(" ")[0]
      : "Traveler";

  useEffect(() => {
    if (!isAuthenticated) {
      setTrips([]);
      setTripsError(null);
      setLoadingTrips(false);
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setTrips([]);
      setLoadingTrips(false);
      return;
    }

    let cancelled = false;
    setLoadingTrips(true);
    setTripsError(null);

    void listItineraries(token)
      .then((rows) => {
        if (!cancelled) setTrips(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setTrips([]);
          setTripsError(
            err instanceof Error ? err.message : "Failed to load your trips",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingTrips(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, getAccessToken]);

  const upcomingCount = useMemo(
    () => trips.filter((trip) => trip.status === "upcoming").length,
    [trips],
  );
  const recentTrips = useMemo(() => pickRecentTrips(trips), [trips]);
  const avgEcoScore = useMemo(() => {
    if (trips.length === 0) return null;
    const sum = trips.reduce((acc, trip) => acc + (trip.eco_score || 0), 0);
    return Math.round(sum / trips.length);
  }, [trips]);
  const totalCarbonKg = useMemo(
    () => trips.reduce((acc, trip) => acc + (trip.carbon_kg || 0), 0),
    [trips],
  );

  const subtitle = !isAuthenticated
    ? "Sign in to see your trips and eco progress — or start planning right away."
    : loadingTrips
      ? "Loading your hub…"
      : trips.length === 0
        ? "No trips yet — start planning your first sustainable journey."
        : upcomingCount === 1
          ? "You have 1 upcoming trip."
          : upcomingCount > 1
            ? `You have ${upcomingCount} upcoming trips.`
            : `You have ${trips.length} saved itinerar${trips.length === 1 ? "y" : "ies"}.`;

  const openTrip = async (trip: SavedItinerarySummary) => {
    const token = getAccessToken();
    if (!token) {
      setTripsError("Please sign in to open this trip.");
      return;
    }
    setOpeningId(trip.id);
    setTripsError(null);
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
      navigate("/dashboard/planning/result", { state });
    } catch (err) {
      setTripsError(err instanceof Error ? err.message : "Failed to open trip");
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <div className="relative mx-auto max-w-4xl">
      <div
        className="pointer-events-none absolute -inset-x-6 -top-10 h-72 rounded-[2rem] bg-[radial-gradient(ellipse_at_top,_rgba(45,106,79,0.12),_transparent_65%)]"
        aria-hidden
      />
      <div className="relative animate-fade-up space-y-8">
        <header className="space-y-4">
          <p className="text-sm font-medium uppercase tracking-wider text-leaf">
            Dashboard
          </p>
          <h1 className="font-display text-4xl font-semibold tracking-tight text-forest sm:text-5xl">
            Welcome back, {greetingName}
          </h1>
          <p className="max-w-2xl text-base text-stone sm:text-lg">{subtitle}</p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => navigate("/dashboard/planning")}
              className="rounded-xl bg-leaf px-5 py-3 text-sm font-semibold text-white shadow-md shadow-forest/15 transition duration-300 hover:-translate-y-0.5 hover:bg-forest hover:shadow-lg active:translate-y-0"
            >
              {isAuthenticated && trips.length > 0
                ? "Continue planning"
                : "Plan your first trip"}
            </button>
            {isAuthenticated && user ? (
              <button
                type="button"
                onClick={() => navigate("/dashboard/profile")}
                className="inline-flex items-center gap-2 rounded-full border border-forest/10 bg-white/90 py-1.5 pl-1.5 pr-3 text-sm font-medium text-forest shadow-sm transition hover:bg-white"
              >
                <UserAvatar
                  picture={user.profile_picture}
                  name={user.name}
                  className="h-8 w-8 text-xs"
                />
                <span className="max-w-[9rem] truncate">{user.name}</span>
                <span className="text-stone/40">·</span>
                <span className="text-leaf">Settings</span>
              </button>
            ) : null}
          </div>
        </header>

        {tripsError ? (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-100">
            {tripsError}
          </p>
        ) : null}

        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <h2 className="font-display text-xl font-semibold text-forest">
              Recent trips
            </h2>
            {isAuthenticated ? (
              <button
                type="button"
                onClick={() => navigate("/dashboard/my-trips")}
                className="text-xs font-semibold uppercase tracking-wider text-leaf transition hover:text-forest"
              >
                View all
              </button>
            ) : null}
          </div>

          {!isAuthenticated ? (
            <SoftPanel>
              Sign in from the sidebar to see your saved trips here.
            </SoftPanel>
          ) : loadingTrips ? (
            <SoftPanel>Loading your trips…</SoftPanel>
          ) : recentTrips.length === 0 ? (
            <SoftPanel>
              <p>No itineraries yet. Plan a trip to see it on your hub.</p>
              <button
                type="button"
                onClick={() => navigate("/dashboard/planning")}
                className="mt-3 text-sm font-semibold text-leaf hover:text-forest"
              >
                Go to Planning →
              </button>
            </SoftPanel>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {recentTrips.map((trip, index) => {
                const busy = openingId === trip.id;
                return (
                  <button
                    key={trip.id}
                    type="button"
                    disabled={busy || Boolean(openingId)}
                    onClick={() => void openTrip(trip)}
                    className="group flex gap-3.5 rounded-2xl bg-white p-3.5 text-left shadow-sm ring-1 ring-forest/8 transition duration-300 hover:-translate-y-0.5 hover:shadow-md disabled:opacity-60 animate-fade-up"
                    style={{ animationDelay: `${index * 80}ms` }}
                  >
                    <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-mist sm:h-28 sm:w-28">
                      <img
                        src={trip.image}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      />
                      <div
                        className="absolute inset-0 bg-gradient-to-t from-ink/25 to-transparent"
                        aria-hidden
                      />
                    </div>
                    <div className="min-w-0 flex-1 space-y-2 py-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={[
                            "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            trip.status === "upcoming"
                              ? "bg-sky-100 text-sky-700"
                              : "bg-stone/10 text-stone",
                          ].join(" ")}
                        >
                          {trip.status === "upcoming" ? "Upcoming" : "Completed"}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-leaf/10 px-2 py-0.5 text-[11px] font-semibold text-leaf">
                          <IconLeaf className="h-3 w-3" />
                          {trip.eco_score}
                        </span>
                      </div>
                      <p className="truncate font-semibold text-ink">{trip.name}</p>
                      <p className="line-clamp-2 text-xs leading-relaxed text-stone">
                        {trip.start_point}
                        <span className="mx-1 text-leaf/60">→</span>
                        {trip.end_point}
                      </p>
                      {busy ? (
                        <p className="text-xs font-medium text-leaf">Opening…</p>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-forest/8 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-3">
              <h2 className="font-display text-xl font-semibold text-forest">
                Eco snapshot
              </h2>
              {!isAuthenticated ? (
                <p className="text-sm text-stone">
                  Sign in to track your average eco score and carbon footprint.
                </p>
              ) : loadingTrips ? (
                <p className="text-sm text-stone">Calculating…</p>
              ) : trips.length === 0 ? (
                <p className="text-sm text-stone">
                  Save a trip to see your eco score and CO₂e here.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-leaf/8 px-4 py-3.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-stone">
                      Avg eco score
                    </p>
                    <p className="mt-1.5 inline-flex items-center gap-2 font-display text-3xl font-semibold text-forest">
                      <IconLeaf className="h-6 w-6 text-leaf" />
                      {avgEcoScore}
                    </p>
                  </div>
                  <div className="rounded-xl bg-forest/5 px-4 py-3.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-stone">
                      Total carbon
                    </p>
                    <p className="mt-1.5 font-display text-3xl font-semibold text-forest">
                      {totalCarbonKg.toFixed(1)}
                      <span className="ml-1.5 text-sm font-medium text-stone">
                        kg CO₂e
                      </span>
                    </p>
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => navigate("/dashboard/eco-score")}
              className="rounded-xl border border-leaf/35 bg-white px-3.5 py-2 text-sm font-semibold text-forest transition hover:border-leaf/50 hover:bg-leaf/5"
            >
              View Eco Score
            </button>
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl font-semibold text-forest">
            Quick actions
          </h2>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {quickActions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => navigate(action.to)}
                className="flex items-start gap-3 rounded-xl bg-white px-3.5 py-3 text-left ring-1 ring-forest/8 transition hover:bg-mist/80 hover:ring-leaf/25"
              >
                <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-leaf/10 text-leaf">
                  <QuickActionIcon id={action.id} />
                </span>
                <span className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{action.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-stone">
                    {action.description}
                  </p>
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
