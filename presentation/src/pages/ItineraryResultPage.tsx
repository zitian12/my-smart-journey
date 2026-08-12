import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { DestinationImage } from "../components/DestinationImage";
import { MalaysiaMap, type MapMarker } from "../components/MalaysiaMap";
import { fetchDestinations } from "../services/destinationApi";
import { recomputeItinerary } from "../services/itineraryApi";
import type { Destination } from "../types/destination";
import type {
  ItineraryGenerateResponse,
  ItineraryResultState,
  OrderedDestination,
  PlaceCoords,
  PlaceInput,
  RecomputeStopInput,
} from "../types/itinerary";
import { ITINERARY_RESULT_STORAGE_KEY } from "../types/itinerary";

const STAY_OPTIONS = [30, 60, 90, 120, 150, 180, 240, 360, 480];

function loadStoredResult(): ItineraryResultState | null {
  try {
    const raw = sessionStorage.getItem(ITINERARY_RESULT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ItineraryResultState;
  } catch {
    return null;
  }
}

function persistResult(state: ItineraryResultState) {
  sessionStorage.setItem(ITINERARY_RESULT_STORAGE_KEY, JSON.stringify(state));
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function pathFromLegs(
  legs: { path?: number[][] }[],
): Array<[number, number]> | undefined {
  const points: Array<[number, number]> = [];
  for (const leg of legs) {
    const path = leg.path;
    if (!Array.isArray(path) || path.length < 2) continue;
    for (const pt of path) {
      if (
        Array.isArray(pt) &&
        pt.length >= 2 &&
        typeof pt[0] === "number" &&
        typeof pt[1] === "number"
      ) {
        points.push([pt[0], pt[1]]);
      }
    }
  }
  // Real road geometry has many vertices; 2 points/leg is still a straight line.
  if (points.length >= 2 && points.length > legs.length * 2) {
    return points;
  }
  return undefined;
}

async function fetchDrivingPath(
  from: [number, number],
  to: [number, number],
): Promise<Array<[number, number]>> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${from[1]},${from[0]};${to[1]},${to[0]}` +
    `?overview=full&geometries=geojson&alternatives=false`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OSRM ${response.status}`);
  }
  const payload = (await response.json()) as {
    code?: string;
    routes?: { geometry?: { coordinates?: number[][] } }[];
  };
  if (payload.code !== "Ok" || !payload.routes?.[0]?.geometry?.coordinates) {
    throw new Error("OSRM route missing");
  }
  return payload.routes[0].geometry.coordinates.map(
    ([lng, lat]) => [lat, lng] as [number, number],
  );
}

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

function resolveEndpoint(
  places: PlaceCoords[],
  name: string,
): PlaceInput | null {
  const match =
    places.find((p) => p.name === name) ??
    places.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (!match) return null;
  return {
    id: match.id,
    name: match.name,
    latitude: match.latitude,
    longitude: match.longitude,
    category_slug: match.category_slug,
  };
}

function toRecomputeStop(
  dest: OrderedDestination,
  places: PlaceCoords[],
): RecomputeStopInput | null {
  const fromPlaces =
    places.find((p) => p.id === dest.id) ??
    places.find((p) => p.name.toLowerCase() === dest.name.toLowerCase());
  const lat = dest.latitude ?? fromPlaces?.latitude;
  const lng = dest.longitude ?? fromPlaces?.longitude;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return {
    id: dest.id,
    name: dest.name,
    latitude: lat,
    longitude: lng,
    category_slug: dest.category_slug ?? fromPlaces?.category_slug ?? null,
    order: dest.order,
    day: dest.day,
    stay_min: dest.stay_min,
  };
}

function mergePlacesAfterRecompute(
  previous: PlaceCoords[],
  itinerary: ItineraryGenerateResponse,
  extra?: PlaceCoords | null,
): PlaceCoords[] {
  const byId = new Map(previous.map((p) => [p.id, p]));
  if (extra) byId.set(extra.id, extra);
  for (const dest of itinerary.destinations) {
    if (typeof dest.latitude !== "number" || typeof dest.longitude !== "number") {
      continue;
    }
    const existing = byId.get(dest.id);
    byId.set(dest.id, {
      id: dest.id,
      name: dest.name,
      latitude: dest.latitude,
      longitude: dest.longitude,
      image: existing?.image ?? null,
      category_slug: dest.category_slug ?? existing?.category_slug ?? null,
      state: existing?.state ?? null,
    });
  }
  return Array.from(byId.values());
}

function AddStopPicker({
  excludeIds,
  onPick,
  disabled,
}: {
  excludeIds: string[];
  onPick: (place: PlaceCoords) => void;
  disabled?: boolean;
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
    <div className="relative mt-4">
      <input
        type="search"
        value={query}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Add a stop — placed by route order…"
        className="w-full rounded-xl border border-leaf/20 bg-mist/40 px-3 py-2 text-sm text-ink outline-none placeholder:text-stone/60 focus:border-leaf/50 focus:ring-2 focus:ring-leaf/20 disabled:opacity-50"
      />
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
                  disabled={disabled}
                  onClick={() => {
                    onPick(toPlaceCoords(d));
                    setQuery("");
                    setOpen(false);
                  }}
                  className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-mist disabled:opacity-50"
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
  );
}

export function ItineraryResultPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const initial =
    (location.state as ItineraryResultState | null) ?? loadStoredResult();

  const [itinerary, setItinerary] = useState<ItineraryGenerateResponse | null>(
    initial?.itinerary ?? null,
  );
  const [places, setPlaces] = useState<PlaceCoords[]>(initial?.places ?? []);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [roadRoute, setRoadRoute] = useState<Array<[number, number]> | undefined>();
  const [routeLoading, setRouteLoading] = useState(false);

  const placeById = useMemo(() => {
    const map = new Map<string, PlaceCoords>();
    for (const place of places) {
      map.set(place.id, place);
    }
    return map;
  }, [places]);

  const placeByName = useMemo(() => {
    const map = new Map<string, PlaceCoords>();
    for (const place of places) {
      map.set(place.name.toLowerCase(), place);
    }
    return map;
  }, [places]);

  const markers: MapMarker[] = useMemo(() => {
    if (!itinerary) return [];
    const ordered: MapMarker[] = [];

    const startPlace =
      places.find((p) => p.name === itinerary.start_location) ?? null;
    if (startPlace) {
      ordered.push({
        id: `start-${startPlace.id}`,
        name: startPlace.name,
        lat: startPlace.latitude,
        lng: startPlace.longitude,
        label: "S",
        kind: "start",
      });
    }

    itinerary.destinations.forEach((dest) => {
      const place =
        placeById.get(dest.id) ??
        placeByName.get(dest.name.toLowerCase()) ??
        (typeof dest.latitude === "number" && typeof dest.longitude === "number"
          ? {
              id: dest.id,
              name: dest.name,
              latitude: dest.latitude,
              longitude: dest.longitude,
            }
          : null);
      if (!place) return;
      ordered.push({
        id: dest.id,
        name: dest.name,
        lat: place.latitude,
        lng: place.longitude,
        label: dest.order,
        kind: "stop",
      });
    });

    const endPlace =
      places.find((p) => p.name === itinerary.end_location) ?? null;
    if (endPlace) {
      ordered.push({
        id: `end-${endPlace.id}`,
        name: endPlace.name,
        lat: endPlace.latitude,
        lng: endPlace.longitude,
        label: "E",
        kind: "end",
      });
    }
    return ordered;
  }, [itinerary, places, placeById, placeByName]);

  const embeddedRoute = useMemo(() => {
    if (!itinerary) return undefined;
    return pathFromLegs(itinerary.legs);
  }, [itinerary]);

  useEffect(() => {
    if (!itinerary) {
      setRoadRoute(undefined);
      return;
    }
    if (embeddedRoute && embeddedRoute.length >= 2) {
      setRoadRoute(embeddedRoute);
      return;
    }
    if (markers.length < 2) {
      setRoadRoute(undefined);
      return;
    }

    let cancelled = false;
    async function loadDrivingRoute() {
      setRouteLoading(true);
      try {
        const chunks: Array<[number, number]> = [];
        for (let i = 0; i < markers.length - 1; i += 1) {
          const a: [number, number] = [markers[i].lat, markers[i].lng];
          const b: [number, number] = [markers[i + 1].lat, markers[i + 1].lng];
          const segment = await fetchDrivingPath(a, b);
          chunks.push(...segment);
        }
        if (!cancelled && chunks.length >= 2) {
          setRoadRoute(chunks);
        }
      } catch {
        if (!cancelled) {
          setRoadRoute(undefined);
        }
      } finally {
        if (!cancelled) setRouteLoading(false);
      }
    }
    void loadDrivingRoute();
    return () => {
      cancelled = true;
    };
  }, [itinerary, embeddedRoute, markers]);

  const route = roadRoute;

  const days = useMemo(() => {
    if (!itinerary) return [] as number[];
    return Array.from({ length: Math.max(1, itinerary.days) }, (_, i) => i + 1);
  }, [itinerary]);

  const excludeIds = useMemo(() => {
    if (!itinerary) return [] as string[];
    const ids = itinerary.destinations.map((d) => d.id);
    const start = places.find((p) => p.name === itinerary.start_location);
    const end = places.find((p) => p.name === itinerary.end_location);
    if (start) ids.push(start.id);
    if (end) ids.push(end.id);
    return ids;
  }, [itinerary, places]);

  const applyRecompute = async (
    nextStops: OrderedDestination[],
    options?: { extraPlace?: PlaceCoords | null; optimizeOrder?: boolean },
  ) => {
    if (!itinerary) return;
    const extraPlace = options?.extraPlace ?? null;
    const optimizeOrder = options?.optimizeOrder ?? false;
    const start = resolveEndpoint(places, itinerary.start_location);
    const end = resolveEndpoint(places, itinerary.end_location);
    if (!start || !end) {
      setActionError("Start/end coordinates missing. Plan again from Planning.");
      return;
    }

    const destinations: RecomputeStopInput[] = [];
    for (const stop of nextStops) {
      const mapped = toRecomputeStop(stop, [
        ...places,
        ...(extraPlace ? [extraPlace] : []),
      ]);
      if (!mapped) {
        setActionError(`Missing coordinates for "${stop.name}".`);
        return;
      }
      if (optimizeOrder) {
        // Let the server re-order and re-pack days (顺路).
        destinations.push({
          id: mapped.id,
          name: mapped.name,
          latitude: mapped.latitude,
          longitude: mapped.longitude,
          category_slug: mapped.category_slug,
          stay_min: mapped.stay_min,
        });
      } else {
        destinations.push(mapped);
      }
    }

    setBusy(true);
    setActionError(null);
    try {
      const updated = await recomputeItinerary({
        start,
        end,
        destinations,
        days: itinerary.days,
        nights: itinerary.nights ?? Math.max(0, itinerary.days - 1),
        hours_per_day: itinerary.hours_per_day,
        interests: itinerary.interests,
        preferred_mode: "driving",
        optimize_order: optimizeOrder,
      });
      const nextPlaces = mergePlacesAfterRecompute(places, updated, extraPlace);
      const nextState: ItineraryResultState = {
        itinerary: updated,
        places: nextPlaces,
      };
      setItinerary(updated);
      setPlaces(nextPlaces);
      persistResult(nextState);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to update itinerary",
      );
    } finally {
      setBusy(false);
    }
  };

  const onDeleteStop = (stopId: string) => {
    if (!itinerary || busy) return;
    const next = itinerary.destinations.filter((d) => d.id !== stopId);
    void applyRecompute(next);
  };

  const onStayChange = (stopId: string, stayMin: number) => {
    if (!itinerary || busy) return;
    const next = itinerary.destinations.map((d) =>
      d.id === stopId ? { ...d, stay_min: stayMin } : d,
    );
    void applyRecompute(next);
  };

  const onDayChange = (stopId: string, day: number) => {
    if (!itinerary || busy) return;
    const next = itinerary.destinations.map((d) =>
      d.id === stopId ? { ...d, day } : d,
    );
    void applyRecompute(next);
  };

  const onAddStop = (place: PlaceCoords) => {
    if (!itinerary || busy) return;
    if (itinerary.destinations.some((d) => d.id === place.id)) {
      setActionError("That stop is already in the plan.");
      return;
    }
    const added: OrderedDestination = {
      id: place.id,
      name: place.name,
      order: itinerary.destinations.length + 1,
      day: 1,
      stay_min: 90,
      latitude: place.latitude,
      longitude: place.longitude,
      category_slug: place.category_slug ?? null,
    };
    void applyRecompute([...itinerary.destinations, added], {
      extraPlace: place,
      optimizeOrder: true,
    });
  };

  if (!itinerary) {
    return (
      <div className="mx-auto max-w-xl animate-fade-up rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-forest/5">
        <h1 className="font-display text-2xl font-semibold text-forest">
          No itinerary yet
        </h1>
        <p className="mt-2 text-sm text-stone">
          Generate a plan from the Planning page to see your day-by-day route.
        </p>
        <Link
          to="/dashboard/planning"
          className="mt-6 inline-flex rounded-xl bg-forest px-5 py-2.5 text-sm font-semibold text-white hover:bg-leaf"
        >
          Back to planning
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl animate-fade-up space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wider text-leaf">
            System plan
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-forest sm:text-4xl">
            {itinerary.start_location} → {itinerary.end_location}
          </h1>
          <p className="mt-2 text-sm text-stone">
            {itinerary.days} day
            {itinerary.days === 1 ? "" : "s"} ·{" "}
            {itinerary.nights ?? Math.max(0, itinerary.days - 1)} night
            {(itinerary.nights ?? Math.max(0, itinerary.days - 1)) === 1
              ? ""
              : "s"}{" "}
            · {itinerary.hours_per_day} hrs/day ·{" "}
            {itinerary.destinations.length} stops
            {itinerary.preferred_mode
              ? ` · ${itinerary.preferred_mode}`
              : ""}
          </p>
          {itinerary.interests.length > 0 ? (
            <p className="mt-1 text-xs text-stone">
              Interests: {itinerary.interests.join(", ")}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-leaf">
            Add, edit stay, or remove stops below. New stops are inserted by
            driving corridor (顺路), not by which day box you used.
          </p>
          {actionError ? (
            <p className="mt-2 text-sm text-red-700">{actionError}</p>
          ) : null}
          {busy ? (
            <p className="mt-2 text-xs text-stone">Updating itinerary…</p>
          ) : null}
          {itinerary.notes.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-stone">
              {itinerary.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate("/dashboard/planning")}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-stone ring-1 ring-forest/10 transition hover:bg-white hover:text-forest"
          >
            Adjust places
          </button>
          <button
            type="button"
            onClick={() => navigate("/dashboard/planning")}
            className="rounded-xl bg-forest px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-leaf"
          >
            Plan again
          </button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Duration"
          value={`${itinerary.days}D / ${itinerary.nights ?? Math.max(0, itinerary.days - 1)}N`}
        />
        <Stat
          label="Travel time"
          value={formatMinutes(itinerary.totals.travel_duration_min)}
        />
        <Stat
          label="Distance"
          value={`${itinerary.totals.distance_km.toFixed(1)} km`}
        />
        <Stat
          label="Carbon"
          value={`${itinerary.totals.carbon_kg.toFixed(2)} kg`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.95fr)] lg:items-start">
        <section className="space-y-5">
          {days.map((day) => {
            const dayStops = itinerary.destinations.filter((d) => d.day === day);
            const dayLegs = itinerary.legs.filter((leg) => leg.day === day);
            const dayTotal = itinerary.day_totals.find((d) => d.day === day);
            return (
              <article
                key={day}
                className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-forest/5 sm:p-6"
              >
                <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                  <h2 className="font-display text-xl font-semibold text-forest">
                    Day {day}
                  </h2>
                  {dayTotal ? (
                    <p className="text-xs text-stone">
                      {formatMinutes(dayTotal.duration_min)} total ·{" "}
                      {formatMinutes(dayTotal.travel_duration_min)} travel
                    </p>
                  ) : null}
                </div>

                <ol className="space-y-4">
                  {dayStops.length === 0 ? (
                    <li className="rounded-xl bg-mist/70 px-3 py-3 text-sm text-stone">
                      No stops yet — add one from the catalog below.
                    </li>
                  ) : (
                    dayStops.map((stop) => (
                      <li key={`${day}-${stop.id}`} className="flex gap-3">
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-leaf/15 text-xs font-semibold text-leaf">
                          {stop.order}
                        </span>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="font-medium text-ink">{stop.name}</p>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => onDeleteStop(stop.id)}
                              className="rounded-lg px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-red-200 transition hover:bg-red-50 disabled:opacity-50"
                            >
                              Remove
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <label className="flex items-center gap-1.5 text-xs text-stone">
                              Stay
                              <select
                                value={stop.stay_min}
                                disabled={busy}
                                onChange={(e) =>
                                  onStayChange(stop.id, Number(e.target.value))
                                }
                                className="rounded-lg border border-forest/10 bg-white px-2 py-1 text-xs text-ink outline-none focus:border-leaf/40 disabled:opacity-50"
                              >
                                {!STAY_OPTIONS.includes(stop.stay_min) ? (
                                  <option value={stop.stay_min}>
                                    {formatMinutes(stop.stay_min)}
                                  </option>
                                ) : null}
                                {STAY_OPTIONS.map((mins) => (
                                  <option key={mins} value={mins}>
                                    {formatMinutes(mins)}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="flex items-center gap-1.5 text-xs text-stone">
                              Day
                              <select
                                value={stop.day}
                                disabled={busy}
                                onChange={(e) =>
                                  onDayChange(stop.id, Number(e.target.value))
                                }
                                className="rounded-lg border border-forest/10 bg-white px-2 py-1 text-xs text-ink outline-none focus:border-leaf/40 disabled:opacity-50"
                              >
                                {days.map((d) => (
                                  <option key={d} value={d}>
                                    Day {d}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        </div>
                      </li>
                    ))
                  )}
                </ol>

                <AddStopPicker
                  excludeIds={excludeIds}
                  disabled={busy}
                  onPick={(place) => onAddStop(place)}
                />

                {dayLegs.length > 0 ? (
                  <div className="mt-5 space-y-2 border-t border-forest/5 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-forest/70">
                      Legs
                    </p>
                    {dayLegs.map((leg, index) => (
                      <div
                        key={`${leg.from_place.id}-${leg.to_place.id}-${index}`}
                        className="rounded-xl bg-mist/70 px-3 py-2 text-sm text-stone"
                      >
                        <span className="font-medium text-ink">
                          {leg.from_place.name}
                        </span>{" "}
                        →{" "}
                        <span className="font-medium text-ink">
                          {leg.to_place.name}
                        </span>
                        <div className="mt-1 text-xs">
                          {leg.selected_mode} · {leg.distance_km.toFixed(1)} km ·{" "}
                          {formatMinutes(leg.duration_min)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>

        <aside className="lg:sticky lg:top-6">
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-forest/5">
            <div className="border-b border-forest/5 px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">Route map</h2>
              <p className="text-xs text-stone">
                {routeLoading
                  ? "Loading driving route…"
                  : route && route.length > markers.length * 2
                    ? "Driving route (road network)"
                    : "OpenStreetMap preview"}
              </p>
            </div>
            <MalaysiaMap
              markers={markers}
              route={route}
              className="h-[min(60vh,560px)] w-full z-0"
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-4 shadow-sm ring-1 ring-forest/5">
      <p className="text-xs font-medium uppercase tracking-wide text-stone">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-forest">{value}</p>
    </div>
  );
}
