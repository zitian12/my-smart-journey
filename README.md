# My Smart Journey

Smart Sustainable Itinerary Planner — a student project that helps travelers build eco-friendly trip plans.

**Frontend:** React + Vite + TypeScript  
**Backend:** FastAPI (Python)

## Architecture layers

```
my-smart-journey/
├── presentation/       # UI (React + Vite)
├── business_logic/     # FastAPI app, services, routers
├── integration/        # Repositories & external APIs
├── database/           # Models & DB connection
├── docker-compose.yml
├── .gitignore
└── README.md
```
## Quick start (UI)

```bash
cd presentation
npm install
npm run dev
```

Open http://localhost:5173

## Deploy (public URL)

To run on phones / other PCs (not only localhost), follow **[DEPLOY.md](DEPLOY.md)**  
(MongoDB Atlas + Render API + Vercel frontend). Free tiers work; Render may cold-start after idle.

## Quick start (API)

```bash
cd business_logic
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Copy `business_logic/.env.example` to `business_logic/.env` and set:

| Variable | Purpose |
|----------|---------|
| `MONGO_URI` | MongoDB connection string |
| `GOOGLE_CLIENT_ID` | Google Sign-In |
| `JWT_SECRET` | JWT signing secret |
| `GEMINI_API_KEY` | Google Gemini API key for destination sync |
| `GEMINI_MODEL` | Gemini model id (default `gemini-3.5-flash-lite`) |
| `DESTINATION_SYNC_SECRET` | Shared secret for `POST /api/destinations/sync` |
| `GOOGLE_CSE_API_KEY` | Optional Google Custom Search API key |
| `GOOGLE_CSE_CX` | Optional Programmable Search Engine ID |
| `SERPAPI_API_KEY` | SerpApi key for real Google Images (recommended) |
| `GOOGLE_MAPS_API_KEY` | Server key: Directions API + Geocoding API (IP-restricted) |

Frontend (`presentation/.env`):

| Variable | Purpose |
|----------|---------|
| `VITE_GOOGLE_CLIENT_ID` | Google Sign-In |
| `VITE_API_URL` | Backend origin |
| `VITE_GOOGLE_MAPS_API_KEY` | Browser key: Maps JavaScript API only (HTTP-referrer restricted) |

Do not reuse OAuth, Gemini, or CSE keys for Maps. Enable only **Maps JavaScript**, **Directions**, and **Geocoding**. Set a Google Cloud budget alert.

New Maps features must follow **[GOOGLE_API_QUOTA.md](GOOGLE_API_QUOTA.md)** (prefer OSM Photon, cache, and existing coordinates over extra Google calls).

Copy `presentation/.env.example` to `presentation/.env` as well.

### Destination images

List/detail cards use **Google Places** photos (seed + on-demand enrich). Do not use SerpApi/Wikipedia images for destination cards.

Refresh the Places catalog (ops, not day-to-day):

```bash
python database/seed_places_destinations.py
python database/seed_featured_destination_media.py
```

## AI Malaysia destinations

Destinations are populated by a Gemini workflow (no admin CRUD UI).

1. Set `GEMINI_API_KEY` (and optionally `DESTINATION_SYNC_SECRET`) in `.env`
2. Seed from the repo root:

```bash
python database/seed_destinations.py
```

Or call the API:

```bash
curl -X POST http://localhost:8000/api/destinations/sync \
  -H "Content-Type: application/json" \
  -H "X-Destination-Sync-Secret: YOUR_SECRET" \
  -d "{\"count_per_state\": 6, \"deactivate_missing\": true}"
```

3. Open `/destinations` to search/filter, then click a card for detail + map

Public endpoints:

- `GET /api/destination-categories`
- `GET /api/destinations?name=&state=&category=`
- `GET /api/destinations/{id}`
- `POST /api/destinations/sync` (secret-protected)

## Docker

```bash
docker compose up
```
