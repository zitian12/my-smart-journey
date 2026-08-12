import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { MalaysiaMap, type MapMarker } from "../components/MalaysiaMap";
import type {
  ItineraryResultState,
  PlaceCoords,
} from "../types/itinerary";
import { ITINERARY_RESULT_STORAGE_KEY } from "../types/itinerary";

function loadStoredResult(): ItineraryResultState | null {
  try {
    const raw = sessionStorage.getItem(ITINERARY_RESULT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ItineraryResultState;
  } catch {
    return null;
  }
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

export function ItineraryResultPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state =
    (location.state as ItineraryResultState | null) ?? loadStoredResult();

  const itinerary = state?.itinerary ?? null;
  const places = state?.places ?? [];
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
        null;
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
          // Last resort: marker order (straight). Prefer empty over misleading.
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
            Stops were chosen from the catalog; visit order and driving legs
            were planned automatically.
          </p>
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
                      No stops scheduled — catalog or daily hours budget limited.
                    </li>
                  ) : (
                    dayStops.map((stop) => (
                      <li key={`${day}-${stop.id}`} className="flex gap-3">
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-leaf/15 text-xs font-semibold text-leaf">
                          {stop.order}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-ink">{stop.name}</p>
                          <p className="text-xs text-stone">
                            Stay {formatMinutes(stop.stay_min)}
                          </p>
                        </div>
                      </li>
                    ))
                  )}
                </ol>

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
