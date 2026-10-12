# LIFEGRID — Real-Time Emergency Coordination Platform

LIFEGRID is a production-oriented emergency coordination platform for citizens, verified ambulance providers, hospitals, resource providers and coordinators.

## Product changes in this build

- Clean, professional light UI with larger typography and less visual noise.
- Citizen emergency reporting supports **typing or browser voice dictation**.
- Emergency location is captured from the user's device when permission is granted.
- No simulated ambulance movement or simulated arrival states are used in the main workflow.
- Ambulance driver GPS is written to the backend from the driver's authenticated device.
- Ambulance status changes use the authenticated `/my-status` workflow.
- Hospital responses are persisted and visible to the network in real time.
- The map uses current database coordinates and an OSRM-compatible road-routing service.
- Realtime synchronization uses Supabase Realtime with polling fallback.
- Role-based workspaces remain separated: citizen, ambulance, hospital, resource provider, coordinator/admin.
- Production mode and demo seeding are disabled by default.

## Important real-world data rule

LIFEGRID does not invent public ambulance drivers, hospital bed availability, or emergency-service capacity. A **real ambulance must be linked to an authenticated ambulance-provider account and send fresh device GPS** before it is dispatchable. A **real hospital must be linked to an approved hospital-provider account and publish current capacity/availability** before it is used for matching.

For public hospital discovery, use an authorized mapping/places provider and then onboard/verify the facility. Public map data can provide location/name information, but it cannot truthfully provide live bed or ambulance availability.

For a real emergency, LIFEGRID is decision-support software and does not replace the official emergency number, dispatch authority, clinicians, or road-safety procedures. In India, the emergency number is **112**.

## Local development

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend

```powershell
cd web
npm ci
copy .env.example .env
npm run dev
```

For split local development set `VITE_API_BASE_URL=http://127.0.0.1:8000/api`.

## Production configuration

Backend:

- PostgreSQL/Supabase `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_JWKS_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- server-only `SUPABASE_SERVICE_ROLE_KEY`
- exact frontend origin in `FRONTEND_URL`
- `LIFEGRID_LOCAL_DEMO=false`
- `LIFEGRID_SEED_DEMO=false`

Frontend:

- `VITE_API_BASE_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- optional `VITE_ROUTING_URL`

## Provider onboarding

1. Create the provider's Supabase Auth account.
2. Submit the hospital/ambulance onboarding form.
3. Coordinator/admin verifies the organization and operational details.
4. Ambulance provider opens the driver workspace and grants browser location permission.
5. The driver sets the unit to **Available** only after GPS is live.
6. Hospital staff keep capacity and emergency acceptance current.
7. Coordinator assigns verified, fresh-GPS ambulances and current hospitals.

## Deployment

The repository includes:

- `render.yaml` for a FastAPI service plus a Vite static site on Render.
- `backend/Dockerfile` for the API.
- `web/vercel.json` for SPA routing if the frontend is deployed to Vercel.

Deployment still requires your own Supabase/PostgreSQL credentials and approved provider accounts. Those secrets are intentionally not embedded in the project.


## Clean setup

1. Copy `backend/.env.example` to `backend/.env` and configure the backend secrets.
2. Copy `web/.env.example` to `web/.env` and configure the public Supabase values plus the deployed API URL.
3. Never commit `.env` files or a Supabase service-role key.
4. For local demo mode only, set `LIFEGRID_LOCAL_DEMO=true` and `LIFEGRID_SEED_DEMO=true`.
5. For production, keep both demo flags `false` and require verified provider accounts and fresh provider GPS.
