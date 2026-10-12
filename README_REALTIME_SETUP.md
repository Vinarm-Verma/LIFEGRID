# LIFEGRID — Repaired / Real-Time Setup

## What was fixed

- Citizen emergency reporting now uses the backend's `/emergencies/intelligent` contract.
- Browser GPS is captured when permission is available and stored with the emergency.
- Missing Supabase frontend configuration no longer crashes the entire React application at import time.
- Added an authenticated backend WebSocket channel:
  `GET/WS /api/realtime/ws/{emergency_id}`.
- Emergency creation, ambulance GPS/status changes, dispatch assignment, hospital availability and hospital response now emit realtime events.
- Supabase Realtime remains supported for production.
- HTTP snapshot sync remains as a recovery path if a realtime transport drops.
- Added a clean 2026 light operational UI layer across login/citizen/provider screens.
- Bundled `.venv`, `node_modules`, and stale build output are intentionally excluded from the clean source package.

## Local setup

### Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python -m uvicorn app.main:app --reload
```

For a local SQLite demo, use:

```env
DATABASE_URL=sqlite:///./lifegrid.db
LIFEGRID_LOCAL_DEMO=true
LIFEGRID_SEED_DEMO=true
```

For Supabase/Postgres production, set `DATABASE_URL` to the Postgres connection string and configure the Supabase JWT settings.

### Frontend

```powershell
cd web
npm install
copy .env.example .env
npm run dev
```

Set these values in `web/.env`:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000/api
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

The frontend must use the Supabase publishable/anon key only. Never put a service-role key in `VITE_*`.

## Production realtime

Run `backend/app/database/LIFEGRID_production_realtime.sql` in the Supabase SQL Editor after the core schema migration. This enables Supabase Realtime publication for the operational tables.

The architecture is:

1. FastAPI writes authoritative state to Postgres.
2. FastAPI emits WebSocket events for immediate single-instance updates.
3. Supabase Realtime handles database changes for production/multi-client deployments.
4. React requests one authoritative `/api/realtime/emergency/{id}` snapshot after each event.
5. A 5-second HTTP sync is retained as a safety/recovery path.

This avoids putting operational database writes directly in the browser.

## Important

LIFEGRID is an emergency coordination/decision-support project. It is not a replacement for official emergency services. The citizen UI continues to direct users to India's emergency number 112 for immediate life-threatening situations.
