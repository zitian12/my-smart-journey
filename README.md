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

### Destination images (Google Images via SerpApi)

Google CSE “Search the entire web” is deprecated. Use SerpApi instead:

1. Sign up at https://serpapi.com/ and copy your API key
2. Put it in `business_logic/.env`:

```env
SERPAPI_API_KEY=your_serpapi_key
```

3. Refresh photos:

```bash
python database/backfill_destination_media.py
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
