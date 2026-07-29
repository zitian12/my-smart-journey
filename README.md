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

## Docker

```bash
docker compose up
```
