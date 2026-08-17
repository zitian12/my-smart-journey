import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  getItinerary,
  ItineraryApiError,
  listItineraries,
} from "../services/itineraryApi";
import type {
  ItineraryGenerateResponse,
  ItineraryResultState,
  SavedItinerarySummary,
  SustainabilitySummary,
} from "../types/itinerary";
import { ITINERARY_RESULT_STORAGE_KEY } from "../types/itinerary";
import {
  aggregateTripFootprints,
  modeLabel,
  ratingLabel,
  resolveSustainability,
} from "../utils/sustainability";

const ALL = "all";

function persistResult(state: ItineraryResultState) {
  sessionStorage.setItem(ITINERARY_RESULT_STORAGE_KEY, JSON.stringify(state));
}

function formatKg(value: number): string {
  return `${value.toFixed(2)} kg CO₂e`;
}

function ratingClasses(rating: string): string {
  if (rating === "excellent") return "bg-leaf text-white";
  if (rating === "good") return "bg-teal-700 text-white";
  if (rating === "moderate") return "bg-amber-500 text-white";
  return "bg-orange-600 text-white";
}

function tripLabel(trip: SavedItinerarySummary): string {
  return trip.name || `${trip.start_point} → ${trip.end_point}`;
}

function ScoreMeter({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = 88;
  const stroke = 14;
  const size = 220;
  const center = size / 2;
  const circumference = Math.PI * radius;
  const dash = (clamped / 100) * circumference;

  return (
    <svg
      viewBox={`0 0 ${size} ${size / 2 + 28}`}
      className="mx-auto h-auto w-full max-w-[260px]"
      role="img"
      aria-label={`Sustainability score ${clamped}`}
    >
      <path
        d={`M ${center - radius} ${center} A ${radius} ${radius} 0 0 1 ${center + radius} ${center}`}
        fill="none"
        stroke="#2d6a4f"
        strokeOpacity={0.12}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      <path
        d={`M ${center - radius} ${center} A ${radius} ${radius} 0 0 1 ${center + radius} ${center}`}
        fill="none"
        stroke="#2d6a4f"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference}`}
      />
      <text
        x={center}
        y={center - 8}
        textAnchor="middle"
        className="fill-forest"
        style={{ fontSize: "42px", fontWeight: 600, fontFamily: "Source Serif 4, serif" }}
      >
        {clamped.toFixed(1).replace(/\.0$/, "")}
      </text>
      <text
        x={center}
        y={center + 16}
        textAnchor="middle"
        className="fill-stone"
        style={{ fontSize: "12px", fontWeight: 500 }}
      >
        of 100
      </text>
    </svg>
  );
}

function IconSparkle() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
      <path d="M12 3.5 13.6 9l5.4 1.6-5.4 1.6L12 17.8l-1.6-5.6L5 10.6 10.4 9 12 3.5Z" />
    </svg>
  );
}

export function EcoScorePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { getAccessToken, isAuthenticated, logout } = useAuth();
  const tripParam = searchParams.get("trip");
  const selected =
    !tripParam || tripParam === ALL || tripParam === "current" ? ALL : tripParam;

  const [trips, setTrips] = useState<SavedItinerarySummary[]>([]);
  const [detail, setDetail] = useState<{
    id: string;
    name: string;
    itinerary: ItineraryGenerateResponse;
  } | null>(null);
  const [listLoading, setListLoading] = useState(isAuthenticated);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setTrips([]);
      setListLoading(false);
      return;
    }
    const token = getAccessToken();
    if (!token) {
      setTrips([]);
      setListLoading(false);
      return;
    }

    let cancelled = false;
    setListLoading(true);
    setError(null);
    void listItineraries(token)
      .then((data) => {
        if (!cancelled) setTrips(data);
      })
      .catch(async (err: unknown) => {
        if (cancelled) return;
        setTrips([]);
        if (err instanceof ItineraryApiError && err.status === 401) {
          setError(null);
          await logout();
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load trips");
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, getAccessToken, logout]);

  useEffect(() => {
    if (selected === ALL) {
      setDetail(null);
      setDetailLoading(false);
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setError("Please sign in to open a saved trip’s sustainability dashboard.");
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setError(null);
    void getItinerary(token, selected)
      .then((item) => {
        if (cancelled) return;
        persistResult({ itinerary: item.itinerary, places: item.places });
        setDetail({ id: item.id, name: item.name, itinerary: item.itinerary });
      })
      .catch(async (err: unknown) => {
        if (cancelled) return;
        setDetail(null);
        if (err instanceof ItineraryApiError && err.status === 401) {
          setError(null);
          await logout();
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load trip");
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selected, getAccessToken, isAuthenticated, logout]);

  const totals = useMemo(
    () => aggregateTripFootprints(trips),
    [trips],
  );

  const detailSustainability = useMemo(
    () => (detail ? resolveSustainability(detail.itinerary) : null),
    [detail],
  );

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

  const onSelect = (value: string) => {
    if (value === ALL) {
      setSearchParams({});
      return;
    }
    setSearchParams({ trip: value });
  };

  const loading = listLoading || (selected !== ALL && detailLoading);

  return (
    <div className="mx-auto max-w-6xl animate-fade-up space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wider text-leaf">
            Sustainability
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-forest sm:text-4xl">
            Eco Score
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

      <label className="block max-w-md">
        <span className="text-xs font-medium uppercase tracking-wide text-stone">
          Select itinerary
        </span>
        <select
          value={selected}
          onChange={(e) => onSelect(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-forest/10 bg-white px-3 py-2.5 text-sm text-ink outline-none ring-forest/20 focus:ring-2"
        >
          <option value={ALL}>All trips</option>
          {trips.map((trip) => (
            <option key={trip.id} value={trip.id}>
              {tripLabel(trip)}
            </option>
          ))}
        </select>
      </label>

      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      {loading ? (
        <p className="rounded-2xl bg-white p-8 text-center text-sm text-stone ring-1 ring-forest/5">
          Loading sustainability dashboard…
        </p>
      ) : selected === ALL ? (
        <AllTripsView
          trips={trips}
          totals={totals}
          isAuthenticated={isAuthenticated}
          onPickTrip={(id) => onSelect(id)}
          onPlan={() => navigate("/dashboard/planning")}
        />
      ) : detail && detailSustainability ? (
        <TripDetailView
          title={detail.name || `${detail.itinerary.start_location} → ${detail.itinerary.end_location}`}
          subtitle={`${detail.itinerary.days} day${detail.itinerary.days === 1 ? "" : "s"}`}
          sustainability={detailSustainability}
          onViewItinerary={() => navigate("/dashboard/planning/result")}
        />
      ) : (
        <p className="rounded-2xl bg-white p-8 text-center text-sm text-stone ring-1 ring-forest/5">
          Choose an itinerary to see its sustainability score.
        </p>
      )}
    </div>
  );
}

function AllTripsView({
  trips,
  totals,
  isAuthenticated,
  onPickTrip,
  onPlan,
}: {
  trips: SavedItinerarySummary[];
  totals: SustainabilitySummary;
  isAuthenticated: boolean;
  onPickTrip: (id: string) => void;
  onPlan: () => void;
}) {
  if (!isAuthenticated) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-forest/5">
        <h2 className="font-display text-2xl font-semibold text-forest">
          Sign in to see your totals
        </h2>
        <p className="mt-2 text-sm text-stone">
          The Eco Score overview adds up every saved itinerary. Sign in from the
          sidebar, then save a trip to see it here.
        </p>
      </div>
    );
  }

  if (trips.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-forest/5">
        <h2 className="font-display text-2xl font-semibold text-forest">
          No saved trips yet
        </h2>
        <p className="mt-2 text-sm text-stone">
          Save an itinerary to see your combined carbon footprint and score here.
        </p>
        <button
          type="button"
          onClick={onPlan}
          className="mt-6 rounded-xl bg-forest px-5 py-2.5 text-sm font-semibold text-white hover:bg-leaf"
        >
          Plan a trip
        </button>
      </div>
    );
  }

  const rating = String(totals.rating || "low");

  return (
    <>
      <p className="text-sm text-stone">
        Combined across {trips.length} saved trip{trips.length === 1 ? "" : "s"}
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-forest/5 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink">Overall sustainability score</h2>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${ratingClasses(rating)}`}
            >
              {ratingLabel(rating)}
            </span>
          </div>
          <div className="mt-4">
            <ScoreMeter score={totals.score} />
          </div>
          <p className="mt-2 text-center text-sm leading-relaxed text-stone">
            Score equals total carbon reduction versus a petrol-car baseline.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <StatCard label="Trips" value={String(trips.length)} />
          <StatCard label="Total footprint" value={formatKg(totals.total_footprint_kg)} />
          <StatCard
            label="Private-car baseline"
            value={formatKg(totals.baseline_footprint_kg)}
          />
          <StatCard
            label="Reduction"
            value={`${totals.reduction_percent.toFixed(1)}%`}
          />
        </section>
      </div>

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-forest/5 sm:p-8">
        <h2 className="text-lg font-semibold text-ink">Environmental impact</h2>
        <p className="mt-3 text-sm leading-relaxed text-stone">{totals.impact_text}</p>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-forest/5 sm:p-8">
        <h2 className="text-lg font-semibold text-ink">Saved trips</h2>
        <ul className="mt-4 divide-y divide-forest/5">
          {trips.map((trip) => (
            <li key={trip.id}>
              <button
                type="button"
                onClick={() => onPickTrip(trip.id)}
                className="flex w-full flex-wrap items-center justify-between gap-2 py-3 text-left first:pt-0 last:pb-0 hover:text-leaf"
              >
                <span>
                  <span className="block text-sm font-medium text-ink">{tripLabel(trip)}</span>
                  <span className="mt-0.5 block text-xs text-stone">
                    {trip.days} day{trip.days === 1 ? "" : "s"} · score {trip.eco_score}
                  </span>
                </span>
                <span className="text-sm font-semibold text-forest">
                  {(trip.carbon_kg ?? 0).toFixed(2)} kg CO₂e
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function TripDetailView({
  title,
  subtitle,
  sustainability,
  onViewItinerary,
}: {
  title: string;
  subtitle: string;
  sustainability: SustainabilitySummary;
  onViewItinerary: () => void;
}) {
  const rating = String(sustainability.rating || "low");
  const modesLabel =
    sustainability.modes_used.length > 0
      ? sustainability.modes_used.map(modeLabel).join(", ")
      : "Car";

  return (
    <>
      <div>
        <p className="text-base font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-sm text-stone">
          {subtitle} · {sustainability.distance_km.toFixed(1)} km · {modesLabel}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-forest/5 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink">Sustainability score</h2>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${ratingClasses(rating)}`}
            >
              {ratingLabel(rating)}
            </span>
          </div>
          <div className="mt-4">
            <ScoreMeter score={sustainability.score} />
          </div>
          <p className="mt-2 text-center text-sm leading-relaxed text-stone">
            Score equals carbon reduction versus a petrol-car baseline.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <StatCard
            label="Total footprint"
            value={formatKg(sustainability.total_footprint_kg)}
          />
          <StatCard
            label="Private-car baseline"
            value={formatKg(sustainability.baseline_footprint_kg)}
          />
          <StatCard
            label="Emissions reduced"
            value={formatKg(sustainability.emissions_reduced_kg)}
          />
          <StatCard
            label="Reduction"
            value={`${sustainability.reduction_percent.toFixed(1)}%`}
          />
        </section>
      </div>

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-forest/5 sm:p-8">
        <h2 className="text-lg font-semibold text-ink">Environmental impact</h2>
        <p className="mt-3 text-sm leading-relaxed text-stone">
          {sustainability.impact_text}
        </p>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-forest/5 sm:p-8">
        <h2 className="text-lg font-semibold text-ink">Travel legs</h2>
        {sustainability.breakdown_by_leg.length === 0 ? (
          <p className="mt-3 text-sm text-stone">No travel legs in this itinerary.</p>
        ) : (
          <ul className="mt-4 divide-y divide-forest/5">
            {sustainability.breakdown_by_leg.map((leg) => (
              <li
                key={`${leg.index}-${leg.from_name}-${leg.to}`}
                className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="text-sm font-medium text-ink">
                    Leg {leg.index}: {leg.from_name} → {leg.to}
                  </p>
                  <p className="mt-0.5 text-xs text-stone">
                    Day {leg.day} · {modeLabel(leg.mode)} · {leg.distance_km.toFixed(1)} km
                  </p>
                </div>
                <p className="text-sm font-semibold text-forest">
                  {leg.carbon_kg.toFixed(2)} kg CO₂e
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-forest/5 sm:p-8">
        <h2 className="text-lg font-semibold text-ink">Sustainability summary</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <SummaryRow label="Score" value={`${sustainability.score.toFixed(1)} / 100`} />
          <SummaryRow label="Rating" value={ratingLabel(rating)} />
          <SummaryRow
            label="Carbon footprint"
            value={formatKg(sustainability.total_footprint_kg)}
          />
          <SummaryRow
            label="Carbon reduction"
            value={`${formatKg(sustainability.emissions_reduced_kg)} (${sustainability.reduction_percent.toFixed(1)}%)`}
          />
          <SummaryRow label="Transport modes" value={modesLabel} />
          <SummaryRow
            label="Distance"
            value={`${sustainability.distance_km.toFixed(1)} km`}
          />
        </dl>
        <p className="mt-4 text-sm leading-relaxed text-stone">
          {sustainability.impact_text}
        </p>
        <button
          type="button"
          onClick={onViewItinerary}
          className="mt-5 rounded-xl bg-forest px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-leaf"
        >
          View itinerary
        </button>
      </section>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white px-5 py-5 shadow-sm ring-1 ring-forest/5">
      <p className="text-xs font-medium uppercase tracking-wide text-stone">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold text-forest">{value}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-mist/80 px-4 py-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-stone">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-ink">{value}</dd>
    </div>
  );
}
