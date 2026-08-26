/**
 * Eco Score / Sustainability Score Dashboard (UC 5.1–5.3).
 * - Select itinerary: All trips or a single saved trip
 * - Export PDF (browser print → Save as PDF)
 * - Monthly / annual history filter + trip counts (All trips)
 *
 * Place at: presentation/src/pages/EcoScorePage.tsx
 *
 * Optional: ModeBreakdownChart at components/ModeBreakdownChart.tsx
 * Optional: breakdown_by_mode on SustainabilitySummary
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ModeBreakdownChart } from "../components/ModeBreakdownChart";
import type { ModeBreakdownRow } from "../components/ModeBreakdownChart";
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
  ECO_SCORE_PRINT_ROOT,
  exportEcoScorePdf,
} from "../utils/exportEcoScorePdf";
import {
  aggregatePeriodModeBreakdown,
  aggregateTripFootprints,
  modeLabel,
  ratingLabel,
  resolveSustainability,
} from "../utils/sustainability";

const ALL = "all";

/** History scope for All-trips dashboard (UC 5.2 monthly/annual). */
type HistoryScope = "all" | "month" | "year";

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

/** Prefer created_at; fall back to updated_at if present. */
function tripTimestamp(trip: SavedItinerarySummary): string | null {
  const anyTrip = trip as SavedItinerarySummary & {
    created_at?: string;
    updated_at?: string;
  };
  const raw = anyTrip.created_at || anyTrip.updated_at;
  if (!raw || typeof raw !== "string") return null;
  return raw;
}

function tripYearMonth(trip: SavedItinerarySummary): string | null {
  const raw = tripTimestamp(trip);
  if (!raw) return null;
  // ISO: 2026-08-20T... → 2026-08
  return raw.slice(0, 7);
}

function tripYear(trip: SavedItinerarySummary): string | null {
  const raw = tripTimestamp(trip);
  if (!raw) return null;
  return raw.slice(0, 4);
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function emptyTotals(): SustainabilitySummary {
  return {
    score: 0,
    rating: "low",
    total_footprint_kg: 0,
    baseline_footprint_kg: 0,
    emissions_reduced_kg: 0,
    reduction_percent: 0,
    distance_km: 0,
    modes_used: [],
    breakdown_by_mode: [],
    breakdown_by_leg: [],
    impact_text:
      "No trips in this period. Save an itinerary or choose another month/year.",
    has_transport_data: false,
  };
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
        style={{
          fontSize: "42px",
          fontWeight: 600,
          fontFamily: "Source Serif 4, serif",
        }}
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

function IconPdf() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  );
}

function PrintReportBanner({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  const generated = new Date().toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    <div className="msj-eco-print-only mb-6 border-b border-forest/20 pb-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-leaf">
        My Smart Journey · Sustainability report
      </p>
      <h1 className="mt-1 font-display text-2xl font-semibold text-forest">
        {title}
      </h1>
      <p className="mt-1 text-sm text-stone">{subtitle}</p>
      <p className="mt-2 text-xs text-stone">Generated {generated}</p>
    </div>
  );
}

export function EcoScorePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { getAccessToken, isAuthenticated, logout } = useAuth();
  const tripParam = searchParams.get("trip");
  const selected =
    !tripParam || tripParam === ALL || tripParam === "current"
      ? ALL
      : tripParam;

  const [trips, setTrips] = useState<SavedItinerarySummary[]>([]);
  const [detail, setDetail] = useState<{
    id: string;
    name: string;
    itinerary: ItineraryGenerateResponse;
  } | null>(null);
  const [listLoading, setListLoading] = useState(isAuthenticated);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** all | month | year — only applies when viewing All trips */
  const [historyScope, setHistoryScope] = useState<HistoryScope>("all");
  /** YYYY-MM when scope === month */
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  /** YYYY when scope === year */
  const [selectedYear, setSelectedYear] = useState<string>("");
  /** Loaded itineraries for period mode chart (all / month / year) */
  const [periodItineraries, setPeriodItineraries] = useState<
    ItineraryGenerateResponse[]
  >([]);
  const [periodModeLoading, setPeriodModeLoading] = useState(false);

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
      setError(
        "Please sign in to open a saved trip’s sustainability dashboard.",
      );
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setError(null);
    void getItinerary(token, selected)
      .then((item) => {
        if (cancelled) return;
        persistResult({ itinerary: item.itinerary, places: item.places });
        setDetail({
          id: item.id,
          name: item.name,
          itinerary: item.itinerary,
        });
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

  /** Distinct months (YYYY-MM) with at least one trip, newest first */
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const t of trips) {
      const ym = tripYearMonth(t);
      if (ym) set.add(ym);
    }
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [trips]);

  /** Distinct years with at least one trip, newest first */
  const availableYears = useMemo(() => {
    const set = new Set<string>();
    for (const t of trips) {
      const y = tripYear(t);
      if (y) set.add(y);
    }
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [trips]);

  // Keep month/year selection valid when trip list changes
  useEffect(() => {
    if (availableMonths.length === 0) {
      setSelectedMonth("");
      return;
    }
    if (!selectedMonth || !availableMonths.includes(selectedMonth)) {
      setSelectedMonth(availableMonths[0]);
    }
  }, [availableMonths, selectedMonth]);

  useEffect(() => {
    if (availableYears.length === 0) {
      setSelectedYear("");
      return;
    }
    if (!selectedYear || !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, selectedYear]);

  /** Trips after monthly/annual filter (All-trips view only) */
  const filteredTrips = useMemo(() => {
    if (historyScope === "all") return trips;
    if (historyScope === "month") {
      if (!selectedMonth) return [];
      return trips.filter((t) => tripYearMonth(t) === selectedMonth);
    }
    // year
    if (!selectedYear) return [];
    return trips.filter((t) => tripYear(t) === selectedYear);
  }, [trips, historyScope, selectedMonth, selectedYear]);

  const totals = useMemo(() => {
    if (filteredTrips.length === 0) return emptyTotals();
    return aggregateTripFootprints(filteredTrips);
  }, [filteredTrips]);

  // Load full itineraries for period mode breakdown chart (All trips only)
  useEffect(() => {
    if (selected !== ALL || filteredTrips.length === 0) {
      setPeriodItineraries([]);
      setPeriodModeLoading(false);
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setPeriodItineraries([]);
      setPeriodModeLoading(false);
      return;
    }

    let cancelled = false;
    setPeriodModeLoading(true);
    const ids = filteredTrips.map((t) => t.id);

    void Promise.all(
      ids.map((id) =>
        getItinerary(token, id)
          .then((item) => item.itinerary)
          .catch(() => null),
      ),
    )
      .then((results) => {
        if (cancelled) return;
        setPeriodItineraries(
          results.filter((item): item is ItineraryGenerateResponse =>
            Boolean(item),
          ),
        );
      })
      .finally(() => {
        if (!cancelled) setPeriodModeLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selected, filteredTrips, getAccessToken]);

  const periodModeRows: ModeBreakdownRow[] = useMemo(
    () => aggregatePeriodModeBreakdown(periodItineraries),
    [periodItineraries],
  );

  const periodLabel = useMemo(() => {
    if (historyScope === "month" && selectedMonth) {
      return formatMonthLabel(selectedMonth);
    }
    if (historyScope === "year" && selectedYear) {
      return selectedYear;
    }
    return "All time";
  }, [historyScope, selectedMonth, selectedYear]);

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

  const canExportPdf =
    !loading &&
    !error &&
    ((selected === ALL &&
      isAuthenticated &&
      filteredTrips.length > 0) ||
      (selected !== ALL && Boolean(detail && detailSustainability)));

  const handleExportPdf = () => {
    if (!canExportPdf) return;
    exportEcoScorePdf();
  };

  return (
    <div
      className={`mx-auto max-w-6xl animate-fade-up space-y-8 ${ECO_SCORE_PRINT_ROOT}`}
    >
      <header
        className="flex flex-wrap items-start justify-between gap-4 print:hidden"
        data-eco-print-hide
      >
        <div>
          <p className="text-sm font-medium uppercase tracking-wider text-leaf">
            Sustainability
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-forest sm:text-4xl">
            Eco Score
          </h1>
          <p className="mt-1 text-sm text-stone">{todayLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={!canExportPdf}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-forest ring-1 ring-forest/15 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            title={
              canExportPdf
                ? "Open print dialog and choose Save as PDF"
                : "Load a trip with sustainability data first"
            }
          >
            <IconPdf />
            Export PDF
          </button>
          <button
            type="button"
            onClick={() => navigate("/dashboard/planning")}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600"
          >
            <IconSparkle />
            Plan a Trip
          </button>
        </div>
      </header>

      <div
        className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end print:hidden"
        data-eco-print-hide
      >
        <label className="block min-w-[12rem] flex-1 max-w-md">
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

        {selected === ALL && isAuthenticated && trips.length > 0 ? (
          <>
            <label className="block min-w-[10rem]">
              <span className="text-xs font-medium uppercase tracking-wide text-stone">
                History
              </span>
              <select
                value={historyScope}
                onChange={(e) =>
                  setHistoryScope(e.target.value as HistoryScope)
                }
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-white px-3 py-2.5 text-sm text-ink outline-none ring-forest/20 focus:ring-2"
              >
                <option value="all">All time</option>
                <option value="month">Monthly</option>
                <option value="year">Annual</option>
              </select>
            </label>

            {historyScope === "month" ? (
              <label className="block min-w-[12rem]">
                <span className="text-xs font-medium uppercase tracking-wide text-stone">
                  Month
                </span>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-forest/10 bg-white px-3 py-2.5 text-sm text-ink outline-none ring-forest/20 focus:ring-2"
                  disabled={availableMonths.length === 0}
                >
                  {availableMonths.length === 0 ? (
                    <option value="">No dated trips</option>
                  ) : (
                    availableMonths.map((ym) => (
                      <option key={ym} value={ym}>
                        {formatMonthLabel(ym)}
                      </option>
                    ))
                  )}
                </select>
              </label>
            ) : null}

            {historyScope === "year" ? (
              <label className="block min-w-[8rem]">
                <span className="text-xs font-medium uppercase tracking-wide text-stone">
                  Year
                </span>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-forest/10 bg-white px-3 py-2.5 text-sm text-ink outline-none ring-forest/20 focus:ring-2"
                  disabled={availableYears.length === 0}
                >
                  {availableYears.length === 0 ? (
                    <option value="">No dated trips</option>
                  ) : (
                    availableYears.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))
                  )}
                </select>
              </label>
            ) : null}
          </>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 print:hidden">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="rounded-2xl bg-white p-8 text-center text-sm text-stone ring-1 ring-forest/5 print:hidden">
          Loading sustainability dashboard…
        </p>
      ) : selected === ALL ? (
        <AllTripsView
          trips={filteredTrips}
          allTripCount={trips.length}
          periodLabel={periodLabel}
          historyScope={historyScope}
          totals={totals}
          periodModeRows={periodModeRows}
          periodModeLoading={periodModeLoading}
          isAuthenticated={isAuthenticated}
          onPickTrip={(id) => onSelect(id)}
          onPlan={() => navigate("/dashboard/planning")}
        />
      ) : detail && detailSustainability ? (
        <TripDetailView
          title={
            detail.name ||
            `${detail.itinerary.start_location} → ${detail.itinerary.end_location}`
          }
          subtitle={`${detail.itinerary.days} day${detail.itinerary.days === 1 ? "" : "s"}`}
          sustainability={detailSustainability}
          onViewItinerary={() => navigate("/dashboard/planning/result")}
        />
      ) : (
        <p className="rounded-2xl bg-white p-8 text-center text-sm text-stone ring-1 ring-forest/5 print:hidden">
          Choose an itinerary to see its sustainability score.
        </p>
      )}
    </div>
  );
}

function AllTripsView({
  trips,
  allTripCount,
  periodLabel,
  historyScope,
  totals,
  periodModeRows,
  periodModeLoading,
  isAuthenticated,
  onPickTrip,
  onPlan,
}: {
  trips: SavedItinerarySummary[];
  allTripCount: number;
  periodLabel: string;
  historyScope: HistoryScope;
  totals: SustainabilitySummary;
  periodModeRows: ModeBreakdownRow[];
  periodModeLoading: boolean;
  isAuthenticated: boolean;
  onPickTrip: (id: string) => void;
  onPlan: () => void;
}) {
  if (!isAuthenticated) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-forest/5 print:hidden">
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

  if (allTripCount === 0) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-forest/5 print:hidden">
        <h2 className="font-display text-2xl font-semibold text-forest">
          No saved trips yet
        </h2>
        <p className="mt-2 text-sm text-stone">
          Save an itinerary to see your combined carbon footprint and score
          here.
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
  const modesLabel =
    totals.modes_used?.length > 0
      ? totals.modes_used.map(modeLabel).join(", ")
      : "—";

  const periodHint =
    historyScope === "all"
      ? `All time · ${trips.length} of ${allTripCount} trip${allTripCount === 1 ? "" : "s"}`
      : `${periodLabel} · ${trips.length} trip${trips.length === 1 ? "" : "s"} (of ${allTripCount} total)`;

  return (
    <>
      <PrintReportBanner
        title="Combined sustainability report"
        subtitle={periodHint}
      />

      <p className="text-sm text-stone print:hidden">{periodHint}</p>

      {trips.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-forest/5">
          <h2 className="font-display text-xl font-semibold text-forest">
            No trips in this period
          </h2>
          <p className="mt-2 text-sm text-stone">
            Try another month or year, or switch History to All time.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-forest/5 sm:p-8">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-ink">
                  Overall sustainability score
                </h2>
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
                Score equals total carbon reduction versus a petrol-car
                baseline.
              </p>
            </section>

            <section className="grid gap-4 sm:grid-cols-2">
              <StatCard label="Trips in period" value={String(trips.length)} />
              <StatCard
                label="Total footprint"
                value={formatKg(totals.total_footprint_kg)}
              />
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
            <h2 className="text-lg font-semibold text-ink">
              Environmental impact
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-stone">
              {totals.impact_text}
            </p>
          </section>

          {periodModeLoading ? (
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-forest/5 sm:p-8">
              <h2 className="text-lg font-semibold text-ink">
                Total CO₂e by transport mode
              </h2>
              <p className="mt-3 text-sm text-stone">
                Loading mode breakdown for this period…
              </p>
            </section>
          ) : (
            <ModeBreakdownChart
              rows={periodModeRows}
              title="Total CO₂e by transport mode"
              metric="carbon"
            />
          )}

          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-forest/5 sm:p-8">
            <h2 className="text-lg font-semibold text-ink">
              Sustainability summary
            </h2>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <SummaryRow
                label="Period"
                value={periodLabel}
              />
              <SummaryRow
                label="Trip count"
                value={`${trips.length} (of ${allTripCount} total)`}
              />
              <SummaryRow
                label="Score"
                value={`${totals.score.toFixed(1)} / 100`}
              />
              <SummaryRow label="Rating" value={ratingLabel(rating)} />
              <SummaryRow
                label="Carbon footprint"
                value={formatKg(totals.total_footprint_kg)}
              />
              <SummaryRow
                label="Carbon reduction"
                value={`${formatKg(totals.emissions_reduced_kg)} (${totals.reduction_percent.toFixed(1)}%)`}
              />
              <SummaryRow label="Transport modes" value={modesLabel} />
              <SummaryRow
                label="Distance"
                value={`${totals.distance_km.toFixed(1)} km`}
              />
            </dl>
          </section>

          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-forest/5 sm:p-8">
            <h2 className="text-lg font-semibold text-ink">
              Trips in this period
            </h2>
            <ul className="mt-4 divide-y divide-forest/5">
              {trips.map((trip) => (
                <li key={trip.id}>
                  <button
                    type="button"
                    onClick={() => onPickTrip(trip.id)}
                    className="flex w-full flex-wrap items-center justify-between gap-2 py-3 text-left first:pt-0 last:pb-0 hover:text-leaf print:pointer-events-none"
                  >
                    <span>
                      <span className="block text-sm font-medium text-ink">
                        {tripLabel(trip)}
                      </span>
                      <span className="mt-0.5 block text-xs text-stone">
                        {trip.days} day{trip.days === 1 ? "" : "s"} · score{" "}
                        {trip.eco_score}
                        {tripYearMonth(trip)
                          ? ` · ${formatMonthLabel(tripYearMonth(trip)!)}`
                          : ""}
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
      )}
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
      <PrintReportBanner
        title={title}
        subtitle={`${subtitle} · ${sustainability.distance_km.toFixed(1)} km · ${modesLabel}`}
      />

      <div className="print:hidden">
        <p className="text-base font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-sm text-stone">
          {subtitle} · {sustainability.distance_km.toFixed(1)} km · {modesLabel}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-forest/5 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink">
              Sustainability score
            </h2>
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
          <p className="mt-3 text-sm text-stone">
            No travel legs in this itinerary.
          </p>
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
                    Day {leg.day} · {modeLabel(leg.mode)} ·{" "}
                    {leg.distance_km.toFixed(1)} km
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
        <h2 className="text-lg font-semibold text-ink">
          Sustainability summary
        </h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <SummaryRow
            label="Score"
            value={`${sustainability.score.toFixed(1)} / 100`}
          />
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
          className="mt-5 rounded-xl bg-forest px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-leaf print:hidden"
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
      <p className="text-xs font-medium uppercase tracking-wide text-stone">
        {label}
      </p>
      <p className="mt-2 font-display text-2xl font-semibold text-forest">
        {value}
      </p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-mist/80 px-4 py-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-stone">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-semibold text-ink">{value}</dd>
    </div>
  );
}
