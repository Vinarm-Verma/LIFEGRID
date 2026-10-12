# LIFEGRID production deployment

## 1. Supabase

Create a Supabase project and configure Auth.

Run the SQL files in `backend/app/database/` in dependency order, including:

1. `LIFEGRID_schema.sql`
2. `LIFEGRID_step45_authentication.sql`
3. `LIFEGRID_production_realtime.sql`

Create provider users through Supabase Auth and assign privileged roles through server-controlled `app_metadata`.

## 2. Render API

Create the API service from `render.yaml` or configure manually:

- Root directory: `backend`
- Dockerfile: `backend/Dockerfile`
- Health check: `/api/health`

Required environment variables:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_JWKS_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FRONTEND_URL`
- `LIFEGRID_LOCAL_DEMO=false`
- `LIFEGRID_SEED_DEMO=false`

## 3. Frontend

Vercel:

- Framework: Vite
- Root directory: `web`
- Build command: `npm run build`
- Output directory: `dist`
- Environment: `VITE_API_BASE_URL=https://YOUR_API_HOST/api`
- Environment: `VITE_SUPABASE_URL=...`
- Environment: `VITE_SUPABASE_PUBLISHABLE_KEY=...`
- Optional: `VITE_ROUTING_URL=https://router.project-osrm.org`

`web/vercel.json` already provides SPA fallback routing.

## 4. Provider verification

Before using the system for real operations:

- Verify every ambulance organization and vehicle.
- Link each vehicle to an authenticated ambulance provider account.
- Require fresh device GPS before an ambulance becomes dispatchable.
- Verify hospital ownership/identity.
- Require hospitals to update emergency acceptance and capacity.
- Confirm coordinator/admin accounts.
- Test the full flow with authorized test providers before real operational use.

## 5. End-to-end acceptance test

1. Citizen signs in.
2. Citizen opens Report Emergency.
3. Citizen types or uses **Speak report**.
4. Browser requests GPS permission.
5. Emergency is created and AI analysis is stored.
6. Coordinator sees the emergency.
7. Coordinator assigns a verified ambulance with fresh provider GPS.
8. Selected hospital receives a request.
9. Hospital accepts/rejects it.
10. Driver changes status from Assigned → En Route → Arrived/Transporting.
11. Driver device GPS updates the database.
12. Citizen/coordinator map refreshes with the live provider position.
13. Realtime events and polling fallback keep dashboards synchronized.

## 6. Safety

LIFEGRID is emergency coordination/decision-support software. It must not be represented as an official EMS dispatch authority or as a medical diagnostic system. For immediate emergencies in India, users should contact 112 as appropriate.
