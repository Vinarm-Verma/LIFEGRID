import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.routes.health import router as health_router
from app.api.routes.hospitals import router as hospitals_router
from app.api.routes.ambulances import router as ambulances_router
from app.api.routes.resources import router as resources_router
from app.api.routes.emergencies import router as emergencies_router
from app.api.routes.ai import router as ai_router
from app.api.routes.matching import router as matching_router
from app.api.routes.hospital_response import router as hospital_response_router
from app.api.routes.realtime import router as realtime_router
from app.api.routes.auth import router as auth_router
from app.api.routes.auth_onboarding import router as auth_onboarding_router

from app.database.database import engine, create_tables, IS_SQLITE
from app.services.seed import seed_demo_data


load_dotenv(override=True)

APP_VERSION = "1.2.0"

frontend_url = os.getenv("FRONTEND_URL", "").strip()

allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

if frontend_url:
    for origin in frontend_url.split(","):
        origin = origin.strip().rstrip("/")
        if origin:
            allowed_origins.append(origin)

allowed_origins = list(dict.fromkeys(allowed_origins))


app = FastAPI(
    title="LIFEGRID Emergency Intelligence API",
    version=APP_VERSION,
    description=(
        "AI-powered emergency intelligence, response coordination, "
        "authentication and provider operations backend."
    ),
)


# CORS is configured for both Vite localhost forms and any configured
# deployment origin. Authorization headers are explicitly allowed because
# LIFEGRID sends the Supabase access token as a Bearer token.
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    # Safe/idempotent startup migration for local SQLite and production DBs.
    create_tables()
    # A fresh local checkout gets usable demo hospitals/ambulances/resources.
    # Existing databases are never overwritten.
    if IS_SQLITE:
        seed_demo_data()


@app.get("/")
def root():
    return {
        "name": "LIFEGRID",
        "status": "online",
        "version": APP_VERSION,
        "message": "Emergency intelligence and coordination API",
    }


@app.get("/api")
def api_root():
    return {
        "name": "LIFEGRID API",
        "status": "online",
        "version": APP_VERSION,
    }


@app.get("/api/db-status")
def db_status():
    try:
        with engine.connect() as connection:
            if IS_SQLITE:
                result = connection.execute(text("SELECT sqlite_version()" )).first()
                return {
                    "database": "sqlite",
                    "version": result[0] if result else None,
                    "connected": True,
                }
            result = connection.execute(text("SELECT current_database(), current_schema()" )).first()
            return {
                "database": result[0] if result else None,
                "schema": result[1] if result else None,
                "connected": True,
            }
    except Exception as exc:
        return {"connected": False, "error": str(exc)}


# Core LIFEGRID API
app.include_router(health_router, prefix="/api")
app.include_router(hospitals_router, prefix="/api")
app.include_router(ambulances_router, prefix="/api")
app.include_router(resources_router, prefix="/api")
app.include_router(emergencies_router, prefix="/api")
app.include_router(ai_router, prefix="/api")
app.include_router(matching_router, prefix="/api")

# hospital_response.py already owns the /api/emergencies/... prefix.
# Do not add another /api prefix here.
app.include_router(hospital_response_router)

app.include_router(realtime_router, prefix="/api")

# Authentication
# auth.py exposes /auth/... routes such as /api/auth/me.
app.include_router(auth_router, prefix="/api")

# Provider onboarding and coordinator approval center.
# auth_onboarding.py already has prefix="/auth".
app.include_router(auth_onboarding_router, prefix="/api")
