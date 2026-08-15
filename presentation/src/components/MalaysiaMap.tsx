import { useEffect, useMemo, useRef, useState } from "react";
import { APIProvider, Map, useMap } from "@vis.gl/react-google-maps";
import { mapCities } from "../data/malaysia";

const MALAYSIA_CENTER = { lat: 4.2105, lng: 108.9758 };
const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

export type MapMarker = {
  id?: string;
  name: string;
  lat: number;
  lng: number;
  label?: string | number;
  kind?: "start" | "stop" | "end";
};

type MalaysiaMapProps = {
  markers?: MapMarker[];
  route?: Array<[number, number]>;
  center?: [number, number];
  zoom?: number;
  className?: string;
  fitBounds?: boolean;
};

function pinColor(kind: MapMarker["kind"] = "stop"): string {
  if (kind === "start") return "#1b4332";
  if (kind === "end") return "#bc6c25";
  return "#2d6a4f";
}

function pinIcon(label: string, kind: MapMarker["kind"]): google.maps.Icon {
  const bg = pinColor(kind);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28">
    <circle cx="14" cy="14" r="12" fill="${bg}" stroke="#fff" stroke-width="2"/>
    <text x="14" y="18" text-anchor="middle" fill="#fff" font-size="11" font-weight="700" font-family="Arial,sans-serif">${label}</text>
  </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(28, 28),
    anchor: new google.maps.Point(14, 14),
  };
}

function MapOverlays({
  markers,
  route,
  fitBounds,
}: {
  markers: MapMarker[];
  route?: Array<[number, number]>;
  fitBounds: boolean;
}) {
  const map = useMap();
  const overlayKey = useMemo(() => {
    const markerPart = markers
      .map((m) => `${m.lat.toFixed(5)},${m.lng.toFixed(5)}:${m.label ?? ""}`)
      .join("|");
    const routePart = (route ?? [])
      .map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`)
      .join("|");
    return `${markerPart}::${routePart}`;
  }, [markers, route]);

  useEffect(() => {
    if (!map) return;

    const gMarkers: google.maps.Marker[] = [];
    const info = new google.maps.InfoWindow();
    let polyline: google.maps.Polyline | null = null;

    markers.forEach((point, index) => {
      const label =
        point.label != null ? String(point.label) : String(index + 1);
      const marker = new google.maps.Marker({
        map,
        position: { lat: point.lat, lng: point.lng },
        title: point.name,
        icon:
          point.label != null || point.kind
            ? pinIcon(label, point.kind)
            : undefined,
      });
      marker.addListener("click", () => {
        info.setContent(
          `<span style="font-weight:600;color:#14201a">${point.name}</span>`,
        );
        info.open({ map, anchor: marker });
      });
      gMarkers.push(marker);
    });

    if (route && route.length >= 2) {
      polyline = new google.maps.Polyline({
        map,
        path: route.map(([lat, lng]) => ({ lat, lng })),
        strokeColor: "#2563eb",
        strokeWeight: 4,
        strokeOpacity: 0.9,
      });
    }

    if (fitBounds) {
      const bounds = new google.maps.LatLngBounds();
      markers.forEach((point) =>
        bounds.extend({ lat: point.lat, lng: point.lng }),
      );
      (route ?? []).forEach(([lat, lng]) => bounds.extend({ lat, lng }));
      if (!bounds.isEmpty()) {
        if (markers.length === 1 && (!route || route.length < 2)) {
          map.setCenter(bounds.getCenter());
          map.setZoom(Math.max(map.getZoom() ?? 11, 11));
        } else {
          map.fitBounds(bounds, 40);
        }
      }
    }

    return () => {
      info.close();
      gMarkers.forEach((marker) => marker.setMap(null));
      polyline?.setMap(null);
    };
  }, [map, overlayKey, fitBounds, markers, route]);

  return null;
}

export function MalaysiaMap({
  markers,
  route,
  center = [MALAYSIA_CENTER.lat, MALAYSIA_CENTER.lng],
  zoom = 5,
  className = "h-[min(70vh,560px)] w-full rounded-2xl z-0",
  fitBounds = true,
}: MalaysiaMapProps) {
  const points: MapMarker[] =
    markers ??
    mapCities.map((city) => ({
      name: city.name,
      lat: city.lat,
      lng: city.lng,
    }));

  if (!API_KEY) {
    return (
      <div
        className={`${className} flex items-center justify-center bg-mist text-sm text-stone`}
      >
        Set VITE_GOOGLE_MAPS_API_KEY to show the map.
      </div>
    );
  }

  return (
    <div className={`${className} overflow-hidden msj-google-map`}>
      <APIProvider apiKey={API_KEY}>
        <Map
          defaultCenter={{ lat: center[0], lng: center[1] }}
          defaultZoom={zoom}
          gestureHandling="greedy"
          disableDefaultUI={false}
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={false}
          style={{ width: "100%", height: "100%" }}
        >
          <MapOverlays
            markers={points}
            route={route}
            fitBounds={
              fitBounds && (points.length > 0 || (route?.length ?? 0) > 0)
            }
          />
        </Map>
      </APIProvider>
    </div>
  );
}

export function LazyMalaysiaMap(props: MalaysiaMapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "80px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  const placeholderClass =
    props.className ?? "h-[min(70vh,560px)] w-full rounded-2xl";

  return (
    <div ref={ref}>
      {visible ? (
        <MalaysiaMap {...props} />
      ) : (
        <div
          className={`${placeholderClass} flex items-center justify-center bg-mist text-sm text-stone`}
        >
          Map loads when you scroll here
        </div>
      )}
    </div>
  );
}
