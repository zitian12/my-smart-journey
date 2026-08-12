import { useEffect } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { mapCities } from "../data/malaysia";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

const defaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = defaultIcon;

const MALAYSIA_CENTER: [number, number] = [4.2105, 108.9758];

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

function numberedIcon(label: string, kind: MapMarker["kind"] = "stop") {
  const bg =
    kind === "start" ? "#1b4332" : kind === "end" ? "#bc6c25" : "#2d6a4f";
  return L.divIcon({
    className: "msj-map-pin",
    html: `<div style="
      display:flex;align-items:center;justify-content:center;
      width:28px;height:28px;border-radius:999px;
      background:${bg};color:#fff;font:600 12px/1 Outfit,system-ui,sans-serif;
      border:2px solid #fff;box-shadow:0 1px 4px rgba(20,32,26,.35);
    ">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

function FitBounds({
  points,
  enabled,
}: {
  points: Array<[number, number]>;
  enabled: boolean;
}) {
  const map = useMap();
  const key = points.map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join("|");

  useEffect(() => {
    if (!enabled || points.length === 0) {
      return;
    }
    if (points.length === 1) {
      map.setView(points[0], Math.max(map.getZoom(), 11));
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 12 });
    // key captures coordinate identity without depending on array identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, map, key]);

  return null;
}

export function MalaysiaMap({
  markers,
  route,
  center = MALAYSIA_CENTER,
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

  const boundPoints: Array<[number, number]> = [
    ...points.map((p) => [p.lat, p.lng] as [number, number]),
    ...(route ?? []),
  ];

  useEffect(() => {
    window.dispatchEvent(new Event("resize"));
  }, [center, zoom, points.length, route?.length]);

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      scrollWheelZoom
      className={className}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={boundPoints} enabled={fitBounds && boundPoints.length > 0} />
      {route && route.length >= 2 ? (
        <Polyline
          positions={route}
          pathOptions={{ color: "#2563eb", weight: 4, opacity: 0.9 }}
        />
      ) : null}
      {points.map((point, index) => {
        const label =
          point.label != null ? String(point.label) : String(index + 1);
        const icon =
          point.label != null || point.kind
            ? numberedIcon(label, point.kind)
            : defaultIcon;
        return (
          <Marker
            key={point.id ?? `${point.name}-${point.lat}-${point.lng}`}
            position={[point.lat, point.lng]}
            icon={icon}
          >
            <Popup>
              <span className="font-medium text-ink">{point.name}</span>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}

