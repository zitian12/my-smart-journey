# Google API quota — save tokens first

Default: **do not call Google if OSM, cached coords, or the destination catalog can do the job.**

This project is on a free / low Google Maps budget. Every new feature must minimize Maps SKUs (Places, Geocoding, Directions, Distance Matrix, Autocomplete). Ask before coding: *how many extra Google calls does this add?* If the answer is more than zero, try OSM, in-process cache, or existing lat/lng first.

Full Maps setup (keys, restrictions) is in [README.md](README.md). This file is the **policy**.

## Allowed Google usage (keep as-is)

| Key | Allowed | When |
|-----|---------|------|
| `VITE_GOOGLE_MAPS_API_KEY` (browser) | Maps JavaScript only | Draw the map, markers, polylines |
| `GOOGLE_MAPS_API_KEY` (server) | Directions | One batched **driving or walking** request per generate/recompute (chunked at 25 waypoints). **Transit** is one cached call per consecutive pair (Google does not support transit waypoints). |
| `GOOGLE_MAPS_API_KEY` (server) | Geocoding | Only if start/end **lack** latitude/longitude |
| `GOOGLE_MAPS_API_KEY` (server) | Places (New) | Catalog **seed** and destination **detail enrich** only |

Do not reuse OAuth, Gemini, or CSE keys for Maps. Restrict the browser key to HTTP referrers + Maps JS; restrict the server key by IP.

## Forbidden

- Places Autocomplete / Place Details for address suggestions (per-keystroke billing)
- Geocoding on input, blur, debounce, or “preview pin” while typing
- `geocode_destination()` for user-typed start/end (it tries 3–4 queries)
- Distance Matrix (use haversine in `integration/external_api/geo.py`)
- Calling Places from itinerary generate / recompute / address suggest
- Frontend calling Nominatim’s public server as autocomplete (against their policy)
- New Google SKUs without an explicit quota review

## Use these instead

**Address suggest + map pin (user planning)**

1. User types in Planning → `GET /api/geocode/suggest?q=` ([`business_logic/routers/geocode.py`](business_logic/routers/geocode.py))
2. Backend proxies **OSM Photon** ([`integration/external_api/photon_client.py`](integration/external_api/photon_client.py)): User-Agent, Malaysia bbox, process cache, `limit=5`
3. Debounce **400ms**, min **3** characters; frontend never talks to Photon/Nominatim directly
4. Picked row already has lat/lng → pin on the planning map immediately
5. Generate sends `{ name, latitude, longitude }` → [`_resolve_user_place`](business_logic/routers/itinerary.py) **skips Google Geocoding**

Recent start/end in `localStorage` (`msj.planning.recent-endpoints`) are also zero-Google suggestions.

**If coords are already present**

Skip Geocoding. Same rule in destination AI seed: do not geocode a catalog row that already has Malaysia coordinates.

**Routing**

- Driving: one Directions call for the full path (`route_waypoints`, `mode=driving`)
- Walking trip: one batched `mode=walking` call **instead of** driving (not in addition). Fallback: OSRM `foot`, then 4.5 km/h estimate
- On a **driving** trip, extra walking Directions stay limited to short legs (≤3 km gate)
- Public transport: one cached `mode=transit` + `transit_mode=bus|subway|tram` call per consecutive pair (Rapid Bus / MRT / LRT). Miss → that leg falls back to driving. Parse turn-by-turn / line steps from the **same** Directions JSON — no extra SKU.
- No Distance Matrix; order/pack with haversine at the selected mode’s speed

**Places**

- `python database/seed_places_destinations.py` and featured-media seed: ops, rare
- On-demand enrich on destination detail: skip if `place_id` / photos already stored
- Never add Places to the trip-planner hot path

## Cache

Keep (and extend, do not remove):

- Photon suggest cache (query → results)
- Geocoding cache (normalized query → lat/lng/formatted)
- Directions cache (rounded points + mode → legs)

Failed lookups should still be cached so we do not retry bad queries.

## Before you add a Maps call

1. Can Photon / catalog / client-supplied coords cover it?
2. If Google is required, is it **one** call on confirm/generate, never per keystroke?
3. Is the result cached?
4. Does the browser key stay Maps JS only?

Typical generate after a suggestion pick: **0 Geocoding + 1 Directions** (driving or walking). Transit generate is **0 Geocoding + N−1 transit Directions** (cached). That is the budget to beat, not to exceed.
