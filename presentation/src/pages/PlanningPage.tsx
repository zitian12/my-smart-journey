import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { MalaysiaMap, type MapMarker } from "../components/MalaysiaMap";
import { fetchDestinationCategories } from "../services/destinationApi";
import {
  fetchAddressSuggestions,
  type AddressSuggestion,
} from "../services/geocodeApi";
import { generateItinerary } from "../services/itineraryApi";
import type { DestinationCategory } from "../types/destination";
import type {
  ItineraryGenerateRequest,
  ItineraryResultState,
  PlaceCoords,
} from "../types/itinerary";
import { ITINERARY_RESULT_STORAGE_KEY } from "../types/itinerary";

type PreferredMode = NonNullable<ItineraryGenerateRequest["preferred_mode"]>;

const TRANSPORT_OPTIONS: { value: PreferredMode; label: string }[] = [
  { value: "driving", label: "Car / driving" },
  { value: "walking", label: "Walk" },
  { value: "transit", label: "Public Transport" },
];

const RECENT_KEY = "msj.planning.recent-endpoints";
const MAX_RECENT = 8;

function slugifyPlace(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "place";
}

function toEndpointPlace(
  name: string,
  latitude: number,
  longitude: number,
  id?: string,
): PlaceCoords {
  return { id: id || slugifyPlace(name), name, latitude, longitude };
}

function suggestionKey(item: { name: string; latitude: number; longitude: number }) {
  return `${item.name.trim().toLowerCase()}|${item.latitude.toFixed(5)}|${item.longitude.toFixed(5)}`;
}

function loadRecent(): AddressSuggestion[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AddressSuggestion[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item &&
        typeof item.name === "string" &&
        typeof item.latitude === "number" &&
        typeof item.longitude === "number",
    );
  } catch {
    return [];
  }
}

function pushRecent(
  current: AddressSuggestion[],
  place: PlaceCoords,
): AddressSuggestion[] {
  const next: AddressSuggestion = {
    id: place.id,
    name: place.name,
    latitude: place.latitude,
    longitude: place.longitude,
    subtitle: "Recent",
  };
  const key = suggestionKey(next);
  return [next, ...current.filter((item) => suggestionKey(item) !== key)].slice(
    0,
    MAX_RECENT,
  );
}

function FieldShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-leaf/20 bg-mist/40 px-3 py-2.5 focus-within:border-leaf/50 focus-within:ring-2 focus-within:ring-leaf/20">
      {children}
    </div>
  );
}

function AddressPicker({
  label,
  value,
  onChange,
  excludeKey,
  recent,
  placeholder,
}: {
  label: string;
  value: PlaceCoords | null;
  onChange: (next: PlaceCoords | null) => void;
  excludeKey: string | null;
  recent: AddressSuggestion[];
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [osm, setOsm] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 400);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open || debounced.length < 3) {
      setOsm([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    void fetchAddressSuggestions(debounced, controller.signal)
      .then((rows) => {
        if (!cancelled) setOsm(rows);
      })
      .catch(() => {
        if (!cancelled) setOsm([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [debounced, open]);

  const needle = query.trim().toLowerCase();
  const recentMatches = useMemo(() => {
    const items = recent.filter((item) => suggestionKey(item) !== excludeKey);
    if (!needle) return items.slice(0, 6);
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(needle) ||
        (item.subtitle ?? "").toLowerCase().includes(needle),
    );
  }, [excludeKey, needle, recent]);

  const osmMatches = useMemo(() => {
    const taken = new Set(
      [...recent.map(suggestionKey), excludeKey].filter(Boolean) as string[],
    );
    return osm
      .map((item) => ({
        ...item,
        id: item.id || `osm-${item.latitude.toFixed(5)}-${item.longitude.toFixed(5)}`,
      }))
      .filter((item) => !taken.has(suggestionKey(item)))
      .slice(0, 5);
  }, [excludeKey, osm, recent]);

  const hasMenu =
    open && (recentMatches.length > 0 || loading || osmMatches.length > 0 || needle.length >= 3);

  const select = (item: AddressSuggestion) => {
    onChange(
      toEndpointPlace(item.name, item.latitude, item.longitude, item.id),
    );
    setQuery("");
    setOpen(false);
  };

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
              setQuery(value.name);
              setOpen(true);
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
              onBlur={() => window.setTimeout(() => setOpen(false), 120)}
              placeholder={placeholder}
              autoComplete="off"
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-stone/60"
            />
          </FieldShell>
          {hasMenu ? (
            <div className="absolute z-20 mt-2 max-h-64 w-full overflow-auto rounded-xl bg-white py-1 shadow-lg ring-1 ring-forest/10">
              {recentMatches.length > 0 ? (
                <div>
                  <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-stone">
                    Recent
                  </p>
                  <ul>
                    {recentMatches.map((item) => (
                      <li key={suggestionKey(item)}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => select(item)}
                          className="flex w-full flex-col px-3 py-2 text-left hover:bg-mist"
                        >
                          <span className="truncate text-sm font-medium text-ink">
                            {item.name}
                          </span>
                          {item.subtitle ? (
                            <span className="truncate text-xs text-stone">
                              {item.subtitle}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {needle.length >= 3 ? (
                <div>
                  <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-stone">
                    Addresses
                  </p>
                  {loading ? (
                    <p className="px-3 py-2 text-sm text-stone">Searching…</p>
                  ) : osmMatches.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-stone">
                      No matching addresses
                    </p>
                  ) : (
                    <ul>
                      {osmMatches.map((item) => (
                        <li key={suggestionKey(item)}>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => select(item)}
                            className="flex w-full flex-col px-3 py-2 text-left hover:bg-mist"
                          >
                            <span className="truncate text-sm font-medium text-ink">
                              {item.name}
                            </span>
                            {item.subtitle ? (
                              <span className="truncate text-xs text-stone">
                                {item.subtitle}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>
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
  const [recent, setRecent] = useState<AddressSuggestion[]>(() => loadRecent());
  const [days, setDays] = useState(3);
  const [nights, setNights] = useState(2);
  const [hoursPerDay, setHoursPerDay] = useState(8);
  const [preferredMode, setPreferredMode] = useState<PreferredMode>("driving");
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
      setFormError(
        "Select a start and end from the suggestions so they can be placed on the map.",
      );
      return;
    }
    if (start.name.trim().toLowerCase() === end.name.trim().toLowerCase()) {
      setFormError("Start and end must be different addresses.");
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
        start: {
          id: start.id,
          name: start.name,
          latitude: start.latitude,
          longitude: start.longitude,
        },
        end: {
          id: end.id,
          name: end.name,
          latitude: end.latitude,
          longitude: end.longitude,
        },
        days,
        nights,
        hours_per_day: hoursPerDay,
        interests,
        preferred_mode: preferredMode,
      });

      const resolvedStart = toEndpointPlace(
        itinerary.start_location || start.name,
        itinerary.start_latitude ?? start.latitude,
        itinerary.start_longitude ?? start.longitude,
        start.id,
      );
      const resolvedEnd = toEndpointPlace(
        itinerary.end_location || end.name,
        itinerary.end_latitude ?? end.latitude,
        itinerary.end_longitude ?? end.longitude,
        end.id,
      );

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

      const places: PlaceCoords[] = [resolvedStart, ...stopPlaces, resolvedEnd];
      const unique = Array.from(
        new Map(places.map((p) => [p.id, p])).values(),
      );
      const state: ItineraryResultState = { itinerary, places: unique };
      sessionStorage.setItem(ITINERARY_RESULT_STORAGE_KEY, JSON.stringify(state));
      const nextRecent = pushRecent(pushRecent(loadRecent(), resolvedStart), resolvedEnd);
      localStorage.setItem(RECENT_KEY, JSON.stringify(nextRecent));
      setRecent(nextRecent);
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
            Pick or search a start and end in Malaysia. Pins appear on the map
            as soon as you select them. Then set days, nights, hours per day,
            transport, and optional interests; the system picks catalog stops
            along your route.
          </p>
        </div>
        <div className="rounded-xl bg-white px-4 py-3 text-sm text-stone ring-1 ring-forest/10">
          <span className="font-semibold text-forest">{days}</span> day
          {days === 1 ? "" : "s"} ·{" "}
          <span className="font-semibold text-forest">{nights}</span> night
          {nights === 1 ? "" : "s"} ·{" "}
          <span className="font-semibold text-forest">{hoursPerDay}</span>
          h/day · {TRANSPORT_OPTIONS.find((o) => o.value === preferredMode)?.label}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.95fr)] lg:items-start">
        <section className="space-y-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-forest/5 sm:p-7">
          <div className="grid gap-4 sm:grid-cols-2">
            <AddressPicker
              label="Starting point"
              value={start}
              onChange={setStart}
              excludeKey={end ? suggestionKey(end) : null}
              recent={recent}
              placeholder="e.g. KL Sentral"
            />
            <AddressPicker
              label="Ending point"
              value={end}
              onChange={setEnd}
              excludeKey={start ? suggestionKey(start) : null}
              recent={recent}
              placeholder="e.g. 12 Jalan Ampang, Kuala Lumpur"
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
              <FieldShell>
                <select
                  value={preferredMode}
                  onChange={(e) =>
                    setPreferredMode(e.target.value as PreferredMode)
                  }
                  className="w-full bg-transparent text-sm font-medium text-forest outline-none"
                >
                  {TRANSPORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </FieldShell>
              <span className="text-xs text-stone">
                Walk and public transport use their own travel times
              </span>
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
                  ? "Select start and end to preview pins."
                  : `${mapMarkers.length} pin${mapMarkers.length === 1 ? "" : "s"} · stops chosen after generate`}
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
