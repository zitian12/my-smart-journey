# Deploy My Smart Journey (fast path)

Goal: a public URL on phones and other PCs — not only `localhost`.

Stack (free tiers OK):

| Layer | Host | Notes |
|-------|------|--------|
| Database | [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) M0 | Free cloud Mongo |
| API | [Render](https://render.com) Web Service | Free; **sleeps when idle** (first request ~30–60s) |
| UI | [Vercel](https://vercel.com) Hobby | Root folder = `presentation` |

Repo helpers already added:

- [`presentation/vercel.json`](presentation/vercel.json) — SPA deep links
- [`render.yaml`](render.yaml) — Render Blueprint for the API

Do **not** commit real `.env` files or secrets.

---

## 1. MongoDB Atlas

1. Create a free **M0** cluster.
2. Database Access → create a user (save password).
3. Network Access → allow `0.0.0.0/0` (or lock later to Render IPs).
4. Connect → Drivers → copy `MONGO_URI`  
   (`mongodb+srv://USER:PASSWORD@cluster.../?retryWrites=true&w=majority`).  
   URL-encode special characters in the password.

Optional: create database name `my_smart_journey` (or whatever your app uses) and seed destinations from your laptop once Atlas is reachable:

```bash
# With MONGO_URI pointing at Atlas in business_logic/.env
python database/seed_places_destinations.py
```

---

## 2. Render (backend)

1. Push this repo to GitHub (if not already).
2. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint** (uses [`render.yaml`](render.yaml))  
   **or** **Web Service** manually:
   - Build: `pip install -r business_logic/requirements.txt`
   - Start: `cd business_logic && uvicorn main:app --host 0.0.0.0 --port $PORT`
3. Set environment variables (from your local `business_logic/.env`):

   | Key | Required |
   |-----|----------|
   | `MONGO_URI` | Yes |
   | `GOOGLE_CLIENT_ID` | Yes (same as frontend) |
   | `JWT_SECRET` | Yes (long random string) |
   | `GOOGLE_MAPS_API_KEY` | Yes (server key) |
   | `GEMINI_API_KEY` | If you use AI sync |
   | `CORS_ORIGINS` | After Vercel exists: `https://YOUR-APP.vercel.app` |

4. Deploy → copy the API URL, e.g. `https://my-smart-journey-api.onrender.com`.
5. Open that URL in a browser; you should see  
   `{"message":"My Smart Journey API is running"}`.

Cold start: after idle, the free service sleeps. The first hit can take up to about a minute.

---

## 3. Vercel (frontend)

1. [Vercel](https://vercel.com) → Import the same GitHub repo.
2. **Root Directory** = `presentation`.
3. Build command: `npm run build` · Output: `dist` (Vite default).
4. Environment variables:

   | Key | Value |
   |-----|--------|
   | `VITE_API_URL` | Render URL **without** trailing slash |
   | `VITE_GOOGLE_CLIENT_ID` | Same as `GOOGLE_CLIENT_ID` |
   | `VITE_GOOGLE_MAPS_API_KEY` | Browser Maps JavaScript key |

5. Deploy → copy the site URL, e.g. `https://my-smart-journey.vercel.app`.
6. Go back to Render and set `CORS_ORIGINS` to that Vercel URL (optional but recommended), then redeploy API.

---

## 4. Google Cloud (login + maps)

Without this, Sign-In or the map breaks on the public site.

1. **OAuth client** (Web):
   - Authorized JavaScript origins:
     - `https://YOUR-APP.vercel.app`
     - `http://localhost:5173` (local)
2. **Browser Maps key** (`VITE_GOOGLE_MAPS_API_KEY`):
   - Application restriction: HTTP referrers  
     `https://YOUR-APP.vercel.app/*`  
     (and `http://localhost:5173/*` for local)
   - API: Maps JavaScript API only
3. **Server Maps key** (`GOOGLE_MAPS_API_KEY`):
   - Keep Directions / Geocoding / Places as you already use
   - Prefer IP restriction to Render if you know egress IPs; otherwise API restriction + budget alert

---

## 5. Smoke test (another device)

1. On phone (mobile data), open the **Vercel** URL.
2. Home → Destinations → Planning → generate.
3. Sign in with Google → Save trip → My Trips.
4. If the first API call hangs, wait for Render wake and retry.

---

## Local vs production

| | Local | Production |
|--|--------|------------|
| Frontend | `npm run dev` → `http://localhost:5173` | Vercel |
| API | `uvicorn` → `http://localhost:8000` | Render |
| `VITE_API_URL` | `http://localhost:8000` | `https://….onrender.com` |

You can keep developing locally; production only needs env + Google console domains.

---

## If free Render sleep is too annoying later

Move the API to your VPS (always-on) and keep Vercel for the UI, or host both on the VPS. Ask for a VPS-focused follow-up guide when you want that.
