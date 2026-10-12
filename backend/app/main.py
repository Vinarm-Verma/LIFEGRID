
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
from app.api.routes.hospital_response import (
    router as hospital_response_router,
)
from app.api.routes.realtime import router as realtime_router
from app.api.routes.auth import router as auth_router
from app.api.routes.auth_onboarding import (
    router as auth_onboarding_router,
)

from app.database.database import engine, create_tables, IS_SQLITE
from app.services.seed import seed_demo_data


# Load backend environment variables.
load_dotenv(override=True)

APP_VERSION = "1.2.1"


# ---------------------------------------------------------
# CORS CONFIGURATION
# ---------------------------------------------------------
# These are the local development origins used by LIFEGRID.
# localhost and 127.0.0.1 are different browser origins.
allowed_origins = {
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
}


# Support additional frontend origins from environment variables.
# Example:
# FRONTEND_URL=https://your-frontend.example.com
# CORS_ORIGINS=https://your-frontend.example.com,https://another.example.com
for variable_name in ("FRONTEND_URL", "CORS_ORIGINS"):
    configured_origins = os.getenv(variable_name, "")

    for value in configured_origins.split(","):
        origin = value.strip().rstrip("/")

        if origin:
            allowed_origins.add(origin)


app = FastAPI(
    title="LIFEGRID Emergency Intelligence API",
    version=APP_VERSION,
    description=(
        "Emergency intelligence, response coordination, "
        "authentication and provider operations backend."
    ),
)


# Register CORS middleware on the actual FastAPI application.
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(allowed_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=600,
)


# ---------------------------------------------------------
# STARTUP
# ---------------------------------------------------------
@app.on_event("startup")
def startup():
    create_tables()

    # Preserve existing local SQLite demo-data initialization.
    if IS_SQLITE:
        seed_demo_data()


# ---------------------------------------------------------
# ROOT AND STATUS ENDPOINTS
# ---------------------------------------------------------
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
                result = connection.execute(
                    text("SELECT sqlite_version()")
                ).first()

                return {
                    "database": "sqlite",
                    "version": result[0] if result else None,
                    "connected": True,
                }

            result = connection.execute(
                text("SELECT current_database(), current_schema()")
            ).first()

            return {
                "database": result[0] if result else None,
                "schema": result[1] if result else None,
                "connected": True,
            }

    except Exception:
        # Avoid exposing database credentials or connection details.
        return {
            "connected": False,
            "error": "Database connection failed.",
        }


# ---------------------------------------------------------
# CORE LIFEGRID API ROUTES
# ---------------------------------------------------------
app.include_router(health_router, prefix="/api")
app.include_router(hospitals_router, prefix="/api")
app.include_router(ambulances_router, prefix="/api")
app.include_router(resources_router, prefix="/api")
app.include_router(emergencies_router, prefix="/api")
app.include_router(ai_router, prefix="/api")
app.include_router(matching_router, prefix="/api")


# This router already defines its /api/emergencies/... paths.
# Do not add another /api prefix here.
app.include_router(hospital_response_router)

app.include_router(realtime_router, prefix="/api")


# ---------------------------------------------------------
# AUTHENTICATION AND PROVIDER ONBOARDING
# ---------------------------------------------------------
app.include_router(auth_router, prefix="/api")
app.include_router(auth_onboarding_router, prefix="/api")
