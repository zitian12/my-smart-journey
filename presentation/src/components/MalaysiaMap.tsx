import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
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
};

type MalaysiaMapProps = {
  markers?: MapMarker[];
  center?: [number, number];
  zoom?: number;
  className?: string;
};

export function MalaysiaMap({
  markers,
  center = MALAYSIA_CENTER,
  zoom = 5,
  className = "h-[min(70vh,560px)] w-full rounded-2xl z-0",
}: MalaysiaMapProps) {
  const points: MapMarker[] =
    markers ??
    mapCities.map((city) => ({
      name: city.name,
      lat: city.lat,
      lng: city.lng,
    }));

  useEffect(() => {
    window.dispatchEvent(new Event("resize"));
  }, [center, zoom, points.length]);

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
      {points.map((point) => (
        <Marker key={point.id ?? `${point.name}-${point.lat}`} position={[point.lat, point.lng]}>
          <Popup>
            <span className="font-medium text-ink">{point.name}</span>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
