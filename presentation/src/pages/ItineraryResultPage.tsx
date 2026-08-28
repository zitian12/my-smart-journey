import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { DestinationImage } from "../components/DestinationImage";
import { MalaysiaMap, type MapMarker } from "../components/MalaysiaMap";
import { useAuth } from "../context/AuthContext";
import { LoginModal } from "../components/LoginModal";
import { fetchDestinations } from "../services/destinationApi";
import { recomputeItinerary, saveItinerary, updateItinerary } from "../services/itineraryApi";
import type { Destination } from "../types/destination";
import type {
  ItineraryGenerateResponse,
  ItineraryLeg,
  ItineraryResultState,
  OrderedDestination,
  PlaceCoords,
  PlaceInput,
  RecomputeStopInput,
  RouteStep,
} from "../types/itinerary";
import { ITINERARY_RESULT_STORAGE_KEY } from "../types/itinerary";
import { ratingLabel, resolveSustainability, modeLabel } from "../utils/sustainability";

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

function formatStepDistance(meters: number | undefined): string {
  if (meters == null || Number.isNaN(meters)) return "";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function maneuverArrow(maneuver: string | null | undefined): string {
  const key = (maneuver || "").toLowerCase();
  if (key.includes("uturn")) return "↩";
  if (key.includes("slight") && key.includes("left")) return "↖";
  if (key.includes("slight") && key.includes("right")) return "↗";
  if (key.includes("left")) return "←";
  if (key.includes("right")) return "→";
  return "↑";
}

function transitLineLabel(step: RouteStep): string {
  const line = (step.line || "").trim();
  const agency = (step.agency || "").trim();
  if (line && agency && !line.toLowerCase().includes("rapid") && /rapid/i.test(agency)) {
    return `${agency} · ${line}`;
  }
  return line || agency || "Public transport";
}

function mapRouteCaption(mode: string | undefined, hasDetailedRoute: boolean): string {
  if (!hasDetailedRoute) return "Google Maps preview";
  if (mode === "walking") return "Walking route";
  if (mode === "transit") return "Public transport route";
  return "Driving route";
}

function usableSteps(leg: ItineraryLeg): RouteStep[] {
  return (leg.steps || []).filter(
    (step) => step && (step.instruction || step.line || step.kind),
  );
}

function LegCard({ leg }: { leg: ItineraryLeg }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const hasDetails = usableSteps(leg).length > 0;

  return (
    <div className="rounded-xl bg-mist/70 px-3 py-2 text-sm text-stone">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="font-medium text-ink">{leg.from_place.name}</span>{" "}
          →{" "}
          <span className="font-medium text-ink">{leg.to_place.name}</span>
          <div className="mt-1 text-xs">
            {modeLabel(leg.selected_mode)} · {leg.distance_km.toFixed(1)} km ·{" "}
            {formatMinutes(leg.duration_min)}
          </div>
        </div>
        {hasDetails ? (
          <button
            type="button"
            className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-forest hover:bg-forest/10"
            onClick={() => setDetailsOpen((open) => !open)}
            aria-expanded={detailsOpen}
          >
            {detailsOpen ? "Hide" : "Details"}
          </button>
        ) : null}
      </div>
      {detailsOpen ? <LegDirections leg={leg} /> : null}
    </div>
  );
}

function LegDirections({
  leg,
}: {
  leg: ItineraryLeg;
}) {
  const steps = usableSteps(leg);
  if (steps.length === 0) return null;
  const isWalk = leg.selected_mode === "walking";

  return (
    <ol className="mt-2 space-y-0 border-l border-forest/15 pl-3">
      {steps.map((step, index) => {
        const distance = formatStepDistance(step.distance_m);
        const duration =
          step.duration_min != null && step.duration_min > 0
            ? formatMinutes(step.duration_min)
            : "";
        if (step.kind === "transit") {
          const fromTo =
            step.from_stop && step.to_stop
              ? `${step.from_stop} → ${step.to_stop}`
              : "";
          return (
            <li key={`${step.line || "transit"}-${index}`} className="relative pb-2">
              <span className="absolute -left-[17px] top-1.5 h-2 w-2 rounded-full bg-leaf" />
              <p className="text-xs font-medium text-ink">
                {transitLineLabel(step)}
                {fromTo ? ` · ${fromTo}` : ""}
              </p>
              {duration || distance ? (
                <p className="text-[11px] text-stone">
                  {[duration, distance].filter(Boolean).join(" · ")}
                </p>
              ) : null}
            </li>
          );
        }
        if (isWalk || step.kind === "walk") {
          return (
            <li key={`${step.instruction || "walk"}-${index}`} className="relative pb-2">
              <span className="absolute -left-[19px] top-0.5 w-4 text-center text-xs text-forest">
                {maneuverArrow(step.maneuver)}
              </span>
              <p className="text-xs font-medium text-ink">
                {step.instruction || "Walk"}
              </p>
              {distance ? (
                <p className="text-[11px] text-stone">{distance}</p>
              ) : null}
            </li>
          );
        }
        const metrics = [duration, distance ? `(${distance})` : ""]
          .filter(Boolean)
          .join(" ");
        return (
          <li key={`${step.instruction || "drive"}-${index}`} className="relative pb-2">
            <span className="absolute -left-[19px] top-0.5 text-xs text-stone">
              ›
            </span>
            <p className="text-xs font-medium text-ink">
              {step.instruction || "Continue"}
            </p>
            {metrics ? (
              <p className="text-[11px] text-stone">{metrics}</p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function dayHubLabel(stops: OrderedDestination[]): string | undefined {
  const labels = stops
    .map((stop) => stop.hub_label?.trim())
    .filter((label): label is string => Boolean(label));
  return labels[0];
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
  if (points.length >= 2) {
    return points;
  }
  return undefined;
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
    hub_label: dest.hub_label ?? null,
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
        const data = await fetchDestinations({ name: debounced, page: 1, page_size: 20 });
        if (!cancelled) {
          setResults(
            data.items
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
  const { isAuthenticated, getAccessToken } = useAuth();
  const initial =
    (location.state as ItineraryResultState | null) ?? loadStoredResult();

  const [itinerary, setItinerary] = useState<ItineraryGenerateResponse | null>(
    initial?.itinerary ?? null,
  );
  const [places, setPlaces] = useState<PlaceCoords[]>(initial?.places ?? []);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [namingOpen, setNamingOpen] = useState(false);
  const [saveChooserOpen, setSaveChooserOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [tripName, setTripName] = useState("");
  const readOnly = Boolean(initial?.readOnly);
  const sharedByName = initial?.sharedByName;
  const savedItineraryId = initial?.savedItineraryId;
  const savedTripName = initial?.savedTripName;

  const sustainability = useMemo(
    () => (itinerary ? resolveSustainability(itinerary) : null),
    [itinerary],
  );

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

  const route = useMemo(() => {
    if (!itinerary) return undefined;
    return pathFromLegs(itinerary.legs);
  }, [itinerary]);

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
    if (readOnly || !itinerary) return;
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
        // Let the server re-order within each day's area.
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
        preferred_mode:
          itinerary.preferred_mode === "walking" ||
          itinerary.preferred_mode === "transit"
            ? itinerary.preferred_mode
            : "driving",
        optimize_order: optimizeOrder,
      });
      const nextPlaces = mergePlacesAfterRecompute(places, updated, extraPlace);
      const nextState: ItineraryResultState = {
        itinerary: updated,
        places: nextPlaces,
        readOnly,
        sharedByName,
        savedItineraryId,
        savedTripName,
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
    if (readOnly || !itinerary || busy) return;
    const next = itinerary.destinations.filter((d) => d.id !== stopId);
    void applyRecompute(next);
  };

  const onStayChange = (stopId: string, stayMin: number) => {
    if (readOnly || !itinerary || busy) return;
    const next = itinerary.destinations.map((d) =>
      d.id === stopId ? { ...d, stay_min: stayMin } : d,
    );
    void applyRecompute(next);
  };

  const onDayChange = (stopId: string, day: number) => {
    if (readOnly || !itinerary || busy) return;
    const next = itinerary.destinations.map((d) =>
      d.id === stopId ? { ...d, day } : d,
    );
    void applyRecompute(next);
  };

  const onAddStop = (place: PlaceCoords) => {
    if (readOnly || !itinerary || busy) return;
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

  const defaultTripName = itinerary
    ? `${itinerary.start_location} → ${itinerary.end_location}`
    : "";

  const continueSaveAfterAuth = () => {
    setSaveError(null);
    if (savedItineraryId) {
      setNamingOpen(false);
      setSaveChooserOpen(true);
      return;
    }
    setTripName(defaultTripName);
    setSaveChooserOpen(false);
    setNamingOpen(true);
  };

  const openSaveDialog = () => {
    if (readOnly) return;
    setSaveError(null);
    setSaveSuccess(false);
    if (!isAuthenticated) {
      setLoginOpen(true);
      return;
    }
    continueSaveAfterAuth();
  };

  const savePayload = () => {
    if (!itinerary) return null;
    return {
      itinerary: {
        ...itinerary,
        nights: itinerary.nights ?? Math.max(0, itinerary.days - 1),
      },
      places,
    };
  };

  const onSaveAsNew = () => {
    setSaveChooserOpen(false);
    setSaveError(null);
    setTripName(defaultTripName);
    setNamingOpen(true);
  };

  const onSaveExisting = async () => {
    if (!itinerary || saveBusy || !savedItineraryId) return;
    const token = getAccessToken();
    if (!token) {
      setSaveChooserOpen(false);
      setLoginOpen(true);
      return;
    }
    const payload = savePayload();
    if (!payload) return;

    setSaveBusy(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await updateItinerary(token, savedItineraryId, payload);
      setSaveChooserOpen(false);
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to update itinerary",
      );
    } finally {
      setSaveBusy(false);
    }
  };

  const onConfirmSave = async () => {
    if (!itinerary || saveBusy) return;
    const token = getAccessToken();
    if (!token) {
      setNamingOpen(false);
      setLoginOpen(true);
      return;
    }
    const payload = savePayload();
    if (!payload) return;

    setSaveBusy(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await saveItinerary(token, {
        name: tripName.trim() || defaultTripName,
        ...payload,
      });
      setNamingOpen(false);
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save itinerary",
      );
    } finally {
      setSaveBusy(false);
    }
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
          to="/planning"
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
              ? ` · ${modeLabel(itinerary.preferred_mode)}`
              : ""}
          </p>
          {itinerary.interests.length > 0 ? (
            <p className="mt-1 text-xs text-stone">
              Interests: {itinerary.interests.join(", ")}
            </p>
          ) : null}
          {readOnly ? (
            <p className="mt-2 rounded-xl bg-leaf/10 px-3 py-2 text-sm text-forest print:hidden">
              Read-only shared trip
              {sharedByName ? ` from ${sharedByName}` : ""}. You can view the
              plan, but only the owner can edit it.
            </p>
          ) : (
            <p className="mt-1 text-xs text-leaf print:hidden">
              Add, edit stay, or remove stops below. New stops are inserted by
              driving corridor (顺路), not by which day box you used.
            </p>
          )}
          {actionError ? (
            <p className="mt-2 text-sm text-red-700 print:hidden">{actionError}</p>
          ) : null}
          {saveError && !namingOpen ? (
            <p className="mt-2 text-sm text-red-700 print:hidden">{saveError}</p>
          ) : null}
          {saveSuccess ? (
            <p className="mt-2 text-sm text-leaf print:hidden">
              Trip saved.{" "}
              <button
                type="button"
                onClick={() => navigate("/my-trips")}
                className="font-semibold underline underline-offset-2"
              >
                View My Trips
              </button>
            </p>
          ) : null}
          {busy ? (
            <p className="mt-2 text-xs text-stone print:hidden">Updating itinerary…</p>
          ) : null}
          {itinerary.notes.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-stone">
              {itinerary.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {sustainability ? (
            <button
              type="button"
              onClick={() => navigate("/eco-score")}
              className="rounded-xl bg-leaf px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-forest"
            >
              Eco Score {sustainability.score.toFixed(0)} ·{" "}
              {ratingLabel(String(sustainability.rating))}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => window.print()}
            disabled={busy}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-forest ring-1 ring-forest/15 transition hover:bg-white"
          >
            Export PDF
          </button>
          {readOnly ? null : (
            <button
              type="button"
              onClick={openSaveDialog}
              disabled={saveBusy || busy}
              className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saveBusy ? "Saving…" : "Save trip"}
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate(readOnly ? "/my-trips" : "/planning")}
            className="rounded-xl bg-forest px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-leaf"
          >
            {readOnly ? "Back to My Trips" : "Plan again"}
          </button>
        </div>
      </header>

      <LoginModal
        open={loginOpen}
        title="Sign in to save this trip"
        message="Sign in with Google to save your itinerary to My Trips."
        onClose={() => setLoginOpen(false)}
        onLoggedIn={() => continueSaveAfterAuth()}
      />

      {saveChooserOpen ? (
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-forest/10 print:hidden sm:p-6">
          <h2 className="text-base font-semibold text-ink">Save this trip</h2>
          <p className="mt-1 text-sm text-stone">
            Update the current saved trip
            {savedTripName ? ` “${savedTripName}”` : ""}, or save a new copy.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onSaveExisting()}
              disabled={saveBusy}
              className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60"
            >
              {saveBusy ? "Saving…" : "Save existing"}
            </button>
            <button
              type="button"
              onClick={onSaveAsNew}
              disabled={saveBusy}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-forest ring-1 ring-forest/15 transition hover:bg-mist disabled:opacity-60"
            >
              Save as new
            </button>
            <button
              type="button"
              onClick={() => setSaveChooserOpen(false)}
              disabled={saveBusy}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-stone ring-1 ring-forest/10 transition hover:bg-mist"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {namingOpen ? (
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-forest/10 print:hidden sm:p-6">
          <h2 className="text-base font-semibold text-ink">Save this trip</h2>
          <p className="mt-1 text-sm text-stone">
            Give it a name so you can find it in My Trips.
          </p>
          <label className="mt-4 block text-sm font-medium text-forest">
            Trip name
            <input
              type="text"
              value={tripName}
              onChange={(e) => setTripName(e.target.value)}
              maxLength={120}
              disabled={saveBusy}
              className="mt-1.5 w-full rounded-xl border border-forest/10 bg-mist/40 px-3 py-2.5 text-sm text-ink outline-none ring-forest/20 focus:ring-2"
              placeholder={defaultTripName}
            />
          </label>
          {saveError ? (
            <p className="mt-2 text-sm text-red-700">{saveError}</p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onConfirmSave()}
              disabled={saveBusy}
              className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60"
            >
              {saveBusy ? "Saving…" : "Confirm save"}
            </button>
            <button
              type="button"
              onClick={() => setNamingOpen(false)}
              disabled={saveBusy}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-stone ring-1 ring-forest/10 transition hover:bg-mist"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
        {sustainability ? (
          <button
            type="button"
            onClick={() => navigate("/eco-score")}
            className="rounded-2xl bg-white px-4 py-4 text-left shadow-sm ring-1 ring-forest/5 transition hover:ring-leaf/30 print:hidden"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-stone">
              Eco Score
            </p>
            <p className="mt-1 text-lg font-semibold text-forest">
              {sustainability.score.toFixed(0)} ·{" "}
              {ratingLabel(String(sustainability.rating))}
            </p>
          </button>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.95fr)] lg:items-start">
        <section className="space-y-5">
          {days.map((day) => {
            const dayStops = itinerary.destinations.filter((d) => d.day === day);
            const dayLegs = itinerary.legs.filter((leg) => leg.day === day);
            const dayTotal = itinerary.day_totals.find((d) => d.day === day);
            const hub = dayHubLabel(dayStops);
            return (
              <article
                key={day}
                className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-forest/5 print:break-inside-avoid sm:p-6"
              >
                <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                  <h2 className="font-display text-xl font-semibold text-forest">
                    {hub ? `Day ${day} · ${hub}` : `Day ${day}`}
                  </h2>
                  {dayTotal ? (
                    <p className="text-xs text-stone">
                      {formatMinutes(dayTotal.duration_min)} total ·{" "}
                      {formatMinutes(dayTotal.travel_duration_min)} travel
                    </p>
                  ) : null}
                </div>
                {dayTotal &&
                dayTotal.duration_min > itinerary.hours_per_day * 60 ? (
                  <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200/80 print:hidden">
                    This day is over {itinerary.hours_per_day} hrs. You can
                    shorten a stay, move a stop to another day, or remove one.
                  </p>
                ) : null}

                <ol className="space-y-4">
                  {dayStops.length === 0 ? (
                    <li className="rounded-xl bg-mist/70 px-3 py-3 text-sm text-stone">
                      No stops yet
                      {readOnly ? null : (
                        <span className="print:hidden"> — add one from the catalog below.</span>
                      )}
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
                            {readOnly ? null : (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => onDeleteStop(stop.id)}
                                className="rounded-lg px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-red-200 transition hover:bg-red-50 disabled:opacity-50 print:hidden"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                          <p
                            className={[
                              "text-xs text-stone",
                              readOnly ? "" : "hidden print:block",
                            ].join(" ")}
                          >
                            Stay {formatMinutes(stop.stay_min)} · Day {stop.day}
                          </p>
                          {readOnly ? null : (
                          <div className="flex flex-wrap gap-2 print:hidden">
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
                          )}
                        </div>
                      </li>
                    ))
                  )}
                </ol>

                {readOnly ? null : (
                  <div className="print:hidden">
                    <AddStopPicker
                      excludeIds={excludeIds}
                      disabled={busy}
                      onPick={(place) => onAddStop(place)}
                    />
                  </div>
                )}

                {dayLegs.length > 0 ? (
                  <div className="mt-5 space-y-2 border-t border-forest/5 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-forest/70">
                      Legs
                    </p>
                    {itinerary.preferred_mode === "walking" ? (
                      <p className="text-[11px] text-stone">
                        Walking directions may not always match real-world
                        conditions.
                      </p>
                    ) : null}
                    {dayLegs.map((leg, index) => (
                      <LegCard
                        key={`${leg.from_place.id}-${leg.to_place.id}-${index}`}
                        leg={leg}
                      />
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>

        <aside className="lg:sticky lg:top-6 print:hidden">
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-forest/5">
            <div className="border-b border-forest/5 px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">Route map</h2>
              <p className="text-xs text-stone">
                {mapRouteCaption(
                  itinerary.preferred_mode,
                  Boolean(route && route.length > markers.length * 2),
                )}
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
