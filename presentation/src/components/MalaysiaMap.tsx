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

export function MalaysiaMap() {
  useEffect(() => {
    // Ensure Leaflet recalculates size after layout/fonts settle
    window.dispatchEvent(new Event("resize"));
  }, []);

  return (
    <MapContainer
      center={MALAYSIA_CENTER}
      zoom={5}
      scrollWheelZoom
      className="h-[min(70vh,560px)] w-full rounded-2xl z-0"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {mapCities.map((city) => (
        <Marker key={city.name} position={[city.lat, city.lng]}>
          <Popup>
            <span className="font-medium text-ink">{city.name}</span>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
