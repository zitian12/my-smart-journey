import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { DestinationImage } from "../components/DestinationImage";
import { MalaysiaMap, type MapMarker } from "../components/MalaysiaMap";
import { fetchDestinationCategories, fetchDestinations } from "../services/destinationApi";
import { generateItinerary } from "../services/itineraryApi";
import type { Destination, DestinationCategory } from "../types/destination";
import type {
  ItineraryResultState,
  PlaceCoords,
  PlaceInput,
} from "../types/itinerary";
import { ITINERARY_RESULT_STORAGE_KEY } from "../types/itinerary";

function hasCoords(d: Destination): boolean {
  return d.latitude != null && d.longitude != null;
}

function toPlaceCoords(d: Destination): PlaceCoords {
  return {
    id: d.id,
    name: d.destination_name,
    latitude: d.latitude as number,
    longitude: d.longitude as number,
    image: d.images[0] ?? null,
    category_slug: d.category_slug ?? null,
    state: d.state || null,
  };
}

function toPlaceInput(p: PlaceCoords): PlaceInput {
  return {
    id: p.id,
    name: p.name,
    latitude: p.latitude,
    longitude: p.longitude,
    category_slug: p.category_slug,
  };
}

function FieldShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-leaf/20 bg-mist/40 px-3 py-2.5 focus-within:border-leaf/50 focus-within:ring-2 focus-within:ring-leaf/20">
      {children}
    </div>
  );
}

function PlacePicker({
  label,
  value,
  onChange,
  excludeIds,
}: {
  label: string;
  value: PlaceCoords | null;
  onChange: (next: PlaceCoords | null) => void;
  excludeIds: string[];
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<Destination[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const excludeKey = excludeIds.slice().sort().join("|");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open || debounced.length < 1) {
      setResults([]);
      return;
    }
    const excluded = new Set(excludeKey ? excludeKey.split("|") : []);
    let cancelled = false;
    async function search() {
      setLoading(true);
      try {
        const data = await fetchDestinations({ name: debounced });
        if (!cancelled) {
          setResults(
            data
              .filter((d) => hasCoords(d) && !excluded.has(d.id))
              .slice(0, 8),
          );
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void search();
    return () => {
      cancelled = true;
    };
  }, [debounced, excludeKey, open]);

  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-stone">{label}</span>
      {value ? (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-forest px-3 py-2.5 text-sm text-white">
          <span className="truncate font-medium">{value.name}</span>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setQuery("");
            }}
            className="shrink-0 rounded-lg bg-white/15 px-2 py-1 text-xs hover:bg-white/25"
          >
            Change
          </button>
        </div>
      ) : (
        <div className="relative">
          <FieldShell>
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder="Search system destinations…"
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-stone/60"
            />
          </FieldShell>
          {open && (loading || results.length > 0 || debounced) ? (
            <ul className="absolute z-20 mt-2 max-h-56 w-full overflow-auto rounded-xl bg-white py-1 shadow-lg ring-1 ring-forest/10">
              {loading ? (
                <li className="px-3 py-2 text-sm text-stone">Searching…</li>
              ) : results.length === 0 ? (
                <li className="px-3 py-2 text-sm text-stone">
                  No mapped destinations found
                </li>
              ) : (
                results.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(toPlaceCoords(d));
                        setQuery("");
                        setOpen(false);
                      }}
                      className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-mist"
                    >
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-mist">
                        <DestinationImage
                          images={d.images}
                          alt={d.destination_name}
                        />
                      </div>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">
                          {d.destination_name}
                        </span>
                        <span className="block truncate text-xs text-stone">
                          {[d.state, d.category_name].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>
      )}
    </label>
  );
}

export function PlanningPage() {
  const navigate = useNavigate();
  const [start, setStart] = useState<PlaceCoords | null>(null);
  const [end, setEnd] = useState<PlaceCoords | null>(null);
  const [days, setDays] = useState(3);
  const [nights, setNights] = useState(2);
  const [hoursPerDay, setHoursPerDay] = useState(8);
  const [interests, setInterests] = useState<string[]>([]);
  const [categories, setCategories] = useState<DestinationCategory[]>([]);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [nightsTouched, setNightsTouched] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadCategories() {
      try {
        const data = await fetchDestinationCategories();
        if (!cancelled) {
          setCategories(data);
          setCategoriesError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setCategories([]);
          setCategoriesError(
            err instanceof Error ? err.message : "Failed to load categories",
          );
        }
      }
    }
    void loadCategories();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!nightsTouched) {
      setNights(Math.max(0, days - 1));
    }
  }, [days, nightsTouched]);

  const mapMarkers: MapMarker[] = useMemo(() => {
    const markers: MapMarker[] = [];
    if (start) {
      markers.push({
        id: `start-${start.id}`,
        name: start.name,
        lat: start.latitude,
        lng: start.longitude,
        label: "S",
        kind: "start",
      });
    }
    if (end) {
      markers.push({
        id: `end-${end.id}`,
        name: end.name,
        lat: end.latitude,
        lng: end.longitude,
        label: "E",
        kind: "end",
      });
    }
    return markers;
  }, [start, end]);

  const toggleInterest = (slug: string) => {
    setInterests((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  };

  const onDaysChange = (value: number) => {
    const next = Math.max(1, Math.min(30, value));
    setDays(next);
    if (!nightsTouched) {
      setNights(Math.max(0, next - 1));
    } else if (nights !== next - 1 && nights !== next) {
      setNights(Math.max(0, next - 1));
      setNightsTouched(false);
    }
  };

  const onNightsChange = (value: number) => {
    setNightsTouched(true);
    const capped = Math.max(0, Math.min(30, value));
    // Keep nights in {days-1, days}
    if (capped === days || capped === days - 1) {
      setNights(capped);
    } else if (capped > days) {
      setNights(days);
    } else {
      setNights(Math.max(0, days - 1));
    }
  };

  const onHoursPerDayChange = (value: number) => {
    setHoursPerDay(Math.max(1, Math.min(16, value || 1)));
  };

  const onGenerate = async () => {
    setFormError(null);
    if (!start || !end) {
      setFormError("Pick a start and end destination from the catalog.");
      return;
    }
    if (nights !== days - 1 && nights !== days) {
      setFormError(`Nights must be ${days - 1} or ${days} for a ${days}-day trip.`);
      return;
    }
    if (hoursPerDay < 1 || hoursPerDay > 16) {
      setFormError("Hours per day must be between 1 and 16.");
      return;
    }

    setSubmitting(true);
    try {
      const itinerary = await generateItinerary({
        start: toPlaceInput(start),
        end: toPlaceInput(end),
        days,
        nights,
        hours_per_day: hoursPerDay,
        interests,
        preferred_mode: "driving",
      });

      const stopPlaces: PlaceCoords[] = itinerary.destinations
        .filter(
          (d) =>
            typeof d.latitude === "number" && typeof d.longitude === "number",
        )
        .map((d) => ({
          id: d.id,
          name: d.name,
          latitude: d.latitude as number,
          longitude: d.longitude as number,
          category_slug: d.category_slug ?? null,
        }));

      const places: PlaceCoords[] = [start, ...stopPlaces, end];
      const unique = Array.from(
        new Map(places.map((p) => [p.id, p])).values(),
      );
      const state: ItineraryResultState = { itinerary, places: unique };
      sessionStorage.setItem(ITINERARY_RESULT_STORAGE_KEY, JSON.stringify(state));
      navigate("/dashboard/planning/result", { state });
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to generate itinerary",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl animate-fade-up">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wider text-leaf">
            Trip planner
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-forest sm:text-4xl">
            Plan your route
          </h1>
          <p className="mt-2 max-w-xl text-sm text-stone">
            Choose days, nights, hours per day, start, end, and optional
            interests. Visit time + travel each day stays within your hours
            budget; the system picks catalog stops for a driving trip.
          </p>
        </div>
        <div className="rounded-xl bg-white px-4 py-3 text-sm text-stone ring-1 ring-forest/10">
          <span className="font-semibold text-forest">{days}</span> day
          {days === 1 ? "" : "s"} ·{" "}
          <span className="font-semibold text-forest">{nights}</span> night
          {nights === 1 ? "" : "s"} ·{" "}
          <span className="font-semibold text-forest">{hoursPerDay}</span>
          h/day · car only
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.95fr)] lg:items-start">
        <section className="space-y-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-forest/5 sm:p-7">
          <div className="grid gap-4 sm:grid-cols-2">
            <PlacePicker
              label="Starting point"
              value={start}
              onChange={setStart}
              excludeIds={[end?.id].filter(Boolean) as string[]}
            />
            <PlacePicker
              label="Ending point"
              value={end}
              onChange={setEnd}
              excludeIds={[start?.id].filter(Boolean) as string[]}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-stone">Days</span>
              <FieldShell>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={days}
                  onChange={(e) => onDaysChange(Number(e.target.value) || 1)}
                  className="w-full bg-transparent text-sm text-ink outline-none"
                />
              </FieldShell>
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-stone">Nights</span>
              <FieldShell>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={nights}
                  onChange={(e) => onNightsChange(Number(e.target.value) || 0)}
                  className="w-full bg-transparent text-sm text-ink outline-none"
                />
              </FieldShell>
              <span className="text-xs text-stone">
                Allowed: {Math.max(0, days - 1)} or {days}
              </span>
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-stone">Hours / day</span>
              <FieldShell>
                <input
                  type="number"
                  min={1}
                  max={16}
                  value={hoursPerDay}
                  onChange={(e) =>
                    onHoursPerDayChange(Number(e.target.value) || 1)
                  }
                  className="w-full bg-transparent text-sm text-ink outline-none"
                />
              </FieldShell>
              <span className="text-xs text-stone">
                Visit + travel must fit within this
              </span>
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-stone">Transport</span>
              <div className="rounded-xl border border-leaf/20 bg-leaf/10 px-3 py-2.5 text-sm font-medium text-forest">
                Car / driving
              </div>
            </label>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink">
                Interests (optional)
              </h2>
              <span className="rounded-full bg-leaf/10 px-2.5 py-0.5 text-xs font-medium text-leaf">
                Soft preference · catalog categories
              </span>
            </div>
            {categoriesError ? (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                {categoriesError}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {categories.length === 0 && !categoriesError ? (
                <p className="text-sm text-stone">Loading categories…</p>
              ) : (
                categories.map((category) => {
                  const selected = interests.includes(category.slug);
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => toggleInterest(category.slug)}
                      className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                        selected
                          ? "bg-forest text-white"
                          : "bg-mist text-ink ring-1 ring-forest/10 hover:bg-leaf/10"
                      }`}
                    >
                      {category.name}
                    </button>
                  );
                })
              )}
            </div>
            <p className="text-xs text-stone">
              Stops are chosen automatically from the destination catalog along
              your route. Interests only bias the mix.
            </p>
          </div>

          {formError ? (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
              {formError}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-3 border-t border-forest/5 pt-5">
            <button
              type="button"
              onClick={() => {
                setStart(null);
                setEnd(null);
                setDays(3);
                setNights(2);
                setHoursPerDay(8);
                setNightsTouched(false);
                setInterests([]);
                setFormError(null);
              }}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-stone transition hover:bg-mist hover:text-forest"
            >
              Clear
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void onGenerate()}
              className="inline-flex items-center gap-2 rounded-xl bg-forest px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-leaf disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Planning…" : "Let system plan"}
              <span aria-hidden>→</span>
            </button>
          </div>
        </section>

        <aside className="lg:sticky lg:top-6">
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-forest/5">
            <div className="border-b border-forest/5 px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">Live map</h2>
              <p className="text-xs text-stone">
                {mapMarkers.length === 0
                  ? "Pick start and end to preview pins."
                  : `${mapMarkers.length} pins · stops chosen after generate`}
              </p>
            </div>
            <MalaysiaMap
              markers={mapMarkers}
              className="h-[min(55vh,520px)] w-full z-0"
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
