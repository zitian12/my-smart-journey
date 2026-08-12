import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { DestinationImage } from "../components/DestinationImage";
import { MalaysiaMap, type MapMarker } from "../components/MalaysiaMap";
import {
  fetchDestinationCategories,
  fetchDestinations,
} from "../services/destinationApi";
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
  const [wishlist, setWishlist] = useState<PlaceCoords[]>([]);

  const [categories, setCategories] = useState<DestinationCategory[]>([]);
  const [nameQuery, setNameQuery] = useState("");
  const [debouncedName, setDebouncedName] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [availableStates, setAvailableStates] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<Destination[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedName(nameQuery), 300);
    return () => window.clearTimeout(timer);
  }, [nameQuery]);

  useEffect(() => {
    let cancelled = false;
    async function loadCategories() {
      try {
        const data = await fetchDestinationCategories();
        if (!cancelled) setCategories(data);
      } catch {
        /* optional for filter dropdown */
      }
    }
    void loadCategories();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadStates() {
      try {
        const data = await fetchDestinations({
          name: debouncedName || undefined,
          category: categoryFilter || undefined,
        });
        if (cancelled) return;
        const states = Array.from(
          new Set(data.map((item) => item.state.trim()).filter(Boolean)),
        ).sort((a, b) => a.localeCompare(b));
        setAvailableStates(states);
        setStateFilter((current) =>
          current && !states.includes(current) ? "" : current,
        );
      } catch {
        if (!cancelled) setAvailableStates([]);
      }
    }
    void loadStates();
    return () => {
      cancelled = true;
    };
  }, [debouncedName, categoryFilter]);

  useEffect(() => {
    let cancelled = false;
    async function loadCatalog() {
      setCatalogLoading(true);
      setCatalogError(null);
      try {
        const data = await fetchDestinations({
          name: debouncedName || undefined,
          state: stateFilter || undefined,
          category: categoryFilter || undefined,
        });
        if (!cancelled) {
          setCatalog(data.filter(hasCoords));
        }
      } catch (err) {
        if (!cancelled) {
          setCatalog([]);
          setCatalogError(
            err instanceof Error ? err.message : "Failed to load destinations",
          );
        }
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    }
    void loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [debouncedName, stateFilter, categoryFilter]);

  const selectedIds = useMemo(() => {
    const ids = new Set(wishlist.map((s) => s.id));
    if (start) ids.add(start.id);
    if (end) ids.add(end.id);
    return ids;
  }, [start, end, wishlist]);

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
    wishlist.forEach((place) => {
      markers.push({
        id: place.id,
        name: place.name,
        lat: place.latitude,
        lng: place.longitude,
        label: "•",
        kind: "stop",
      });
    });
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
  }, [start, end, wishlist]);

  const toggleWish = (destination: Destination) => {
    if (!hasCoords(destination)) return;
    const place = toPlaceCoords(destination);
    setWishlist((prev) => {
      if (prev.some((s) => s.id === place.id)) {
        return prev.filter((s) => s.id !== place.id);
      }
      return [...prev, place];
    });
  };

  const onGenerate = async () => {
    setFormError(null);
    if (!start || !end) {
      setFormError("Pick a start and end destination from the catalog.");
      return;
    }
    if (wishlist.length < 1) {
      setFormError("Add at least one place you want to visit.");
      return;
    }

    setSubmitting(true);
    try {
      const itinerary = await generateItinerary({
        start: toPlaceInput(start),
        end: toPlaceInput(end),
        destinations: wishlist.map(toPlaceInput),
      });

      const places: PlaceCoords[] = [start, ...wishlist, end];
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
            Pick start, end, and places you want to visit. The system decides
            days, nights, stay times, visit order, and transport.
          </p>
        </div>
        <div className="rounded-xl bg-white px-4 py-3 text-sm text-stone ring-1 ring-forest/10">
          <span className="font-semibold text-forest">{wishlist.length}</span>{" "}
          places selected · duration & route auto-planned
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.95fr)] lg:items-start">
        <section className="space-y-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-forest/5 sm:p-7">
          <div className="grid gap-4 sm:grid-cols-2">
            <PlacePicker
              label="Starting point"
              value={start}
              onChange={setStart}
              excludeIds={[end?.id, ...wishlist.map((s) => s.id)].filter(
                Boolean,
              ) as string[]}
            />
            <PlacePicker
              label="Ending point"
              value={end}
              onChange={setEnd}
              excludeIds={[start?.id, ...wishlist.map((s) => s.id)].filter(
                Boolean,
              ) as string[]}
            />
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink">
                Places you want to visit
              </h2>
              <span className="rounded-full bg-leaf/10 px-2.5 py-0.5 text-xs font-medium text-leaf">
                Wishlist · order auto
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <input
                type="search"
                value={nameQuery}
                onChange={(e) => setNameQuery(e.target.value)}
                placeholder="Search name…"
                className="rounded-xl border border-forest/15 bg-mist/30 px-3 py-2.5 text-sm outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/20 sm:col-span-1"
              />
              <select
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                className="rounded-xl border border-forest/15 bg-mist/30 px-3 py-2.5 text-sm outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/20"
              >
                <option value="">All states</option>
                {availableStates.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-xl border border-forest/15 bg-mist/30 px-3 py-2.5 text-sm outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/20"
              >
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            {catalogError ? (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                {catalogError}
              </p>
            ) : null}

            <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl bg-mist/40 p-2 ring-1 ring-forest/5">
              {catalogLoading ? (
                <p className="px-2 py-4 text-sm text-stone">Loading destinations…</p>
              ) : catalog.length === 0 ? (
                <p className="px-2 py-4 text-sm text-stone">
                  No destinations with map coordinates match these filters.
                </p>
              ) : (
                catalog.slice(0, 40).map((destination) => {
                  const selected = selectedIds.has(destination.id);
                  const isEndpoint =
                    start?.id === destination.id || end?.id === destination.id;
                  return (
                    <button
                      key={destination.id}
                      type="button"
                      disabled={isEndpoint}
                      onClick={() => toggleWish(destination)}
                      className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition ${
                        selected
                          ? "bg-leaf/15 ring-1 ring-leaf/30"
                          : "hover:bg-white"
                      } ${isEndpoint ? "cursor-not-allowed opacity-50" : ""}`}
                    >
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white">
                        <DestinationImage
                          images={destination.images}
                          alt={destination.destination_name}
                        />
                      </div>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">
                          {destination.destination_name}
                        </span>
                        <span className="block truncate text-xs text-stone">
                          {[destination.state, destination.category_name]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-leaf">
                        {isEndpoint
                          ? "Endpoint"
                          : selected
                            ? "Added"
                            : "Add"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-ink">
              Selected places ({wishlist.length})
            </h2>
            {wishlist.length === 0 ? (
              <p className="rounded-xl bg-mist/60 px-4 py-3 text-sm text-stone">
                Add places above. Visit order will be optimized automatically.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {wishlist.map((place) => (
                  <li
                    key={place.id}
                    className="inline-flex items-center gap-2 rounded-full bg-mist px-3 py-1.5 text-sm text-ink ring-1 ring-leaf/20"
                  >
                    <span className="max-w-[12rem] truncate font-medium">
                      {place.name}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${place.name}`}
                      onClick={() =>
                        setWishlist((prev) =>
                          prev.filter((s) => s.id !== place.id),
                        )
                      }
                      className="text-stone hover:text-red-600"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
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
                setWishlist([]);
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
                  ? "Pick start, places, and end to preview pins."
                  : `${mapMarkers.length} pins · final order set after generate`}
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
