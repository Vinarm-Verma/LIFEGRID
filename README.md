# LIFEGRID

LIFEGRID is an emergency-intelligence and response-coordination prototype with a React/Vite frontend and FastAPI backend.

## Project structure

- `backend/` — FastAPI API, SQLite/PostgreSQL database layer, matching, dispatch, hospital response and authentication.
- `web/` — React/Vite application.

## Windows local setup

Open PowerShell in the project root (`D:\LIFEGRID\LIFEGRID` after extraction).

### Backend

```powershell
D:\LIFEGRID\.venv\Scripts\Activate.ps1
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

API: http://localhost:8000
Swagger: http://localhost:8000/docs

### Frontend

Open a second PowerShell:

```powershell
cd web
npm install
npm run dev
```

Frontend: http://localhost:5173

## Database

The local backend uses `backend/lifegrid.db` when `DATABASE_URL` is not set. On startup LIFEGRID:

1. creates missing SQLAlchemy tables;
2. migrates older SQLite databases in-place;
3. creates dispatch/location/onboarding tables;
4. seeds demo data only when the local database has no hospital records.

Existing local data is not deleted by the migration.

`LIFEGRID_LOCAL_DEMO=true` keeps the bundled provider records usable for local end-to-end demonstrations. Set it to `false` in production so dispatch requires a real provider-owned account and fresh device GPS.

## Supabase

The frontend uses the Supabase publishable key. The backend can validate Supabase access tokens through JWKS or the Supabase Auth user endpoint. For provider onboarding/approval, configure the backend service-role key only on the server; never place it in `web/.env`.

## Troubleshooting

If the browser reports `Failed to fetch` for a LIFEGRID API call:

1. Confirm the backend is running from `backend/`.
2. Open http://localhost:8000/docs.
3. Hard-refresh the frontend with `Ctrl+Shift+R`.
4. Check the backend terminal for the real HTTP 4xx/5xx response.

The frontend defaults to `http://localhost:8000/api` so local development uses one consistent hostname.
