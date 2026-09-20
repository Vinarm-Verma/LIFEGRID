"""LIFEGRID Step 5 — authenticated ambulance provider API."""
import os
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database.database import get_db, IS_SQLITE

router = APIRouter(prefix="/ambulances", tags=["Ambulances"])

LIVE_STATUSES = {"available", "assigned", "en_route", "arrived", "transporting", "busy"}
VALID_STATUSES = LIVE_STATUSES | {"offline", "hospital"}
MANUAL_STATUSES = {"available", "offline", "busy"}


def now():
    return datetime.now(timezone.utc)


def owned(db, user):
    row = db.execute(text("select * from ambulances where owner_auth_user_id=:uid and is_active=true limit 1"), {"uid": str(user["id"])}).mappings().first()
    if not row and IS_SQLITE and os.getenv("LIFEGRID_LOCAL_DEMO", "true").lower() in {"1", "true", "yes", "on"}:
        row = db.execute(text("select * from ambulances where vehicle_number like 'LG-AMB-%' and is_active=true order by id limit 1")).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="No active ambulance is linked to this provider account.")
    return dict(row)


def public(row):
    return {
        "id": row.get("id"), "vehicle_number": row.get("vehicle_number"), "provider_name": row.get("provider_name"),
        "ambulance_type": row.get("ambulance_type"), "latitude": row.get("latitude"), "longitude": row.get("longitude"),
        "status": row.get("status"), "oxygen_available": row.get("oxygen_available"),
        "ventilator_available": row.get("ventilator_available"), "paramedic_available": row.get("paramedic_available"),
        "is_active": row.get("is_active"), "last_updated": row.get("last_updated"),
        "location_updated_at": row.get("location_updated_at"), "gps_accuracy_m": row.get("gps_accuracy_m"),
        "gps_source": row.get("gps_source"), "verification_status": row.get("verification_status"),
    }


@router.get("")
def get_ambulances(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    rows = db.execute(text("""
        select * from ambulances
        where is_active=true and owner_auth_user_id is not null
          and verification_status in ('verified','provider_claimed')
          and status in ('available','assigned','en_route','arrived','transporting','busy')
        order by id
    """)).mappings().all()
    return [public(dict(row)) for row in rows]


@router.get("/my-profile")
def my_profile(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    if user.get("role") != "ambulance":
        raise HTTPException(status_code=403, detail="Ambulance provider access required.")
    row = owned(db, user)
    return {"role": "ambulance", "profile": public(row)}


class StatusRequest(BaseModel):
    status: str


@router.patch("/my-status")
def my_status(payload: StatusRequest, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    if user.get("role") != "ambulance":
        raise HTTPException(status_code=403, detail="Ambulance provider access required.")
    status = payload.status.strip().lower()
    if status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid ambulance status. Use one of: {', '.join(sorted(VALID_STATUSES))}.")
    if status not in MANUAL_STATUSES:
        raise HTTPException(status_code=409, detail="Dispatch-controlled statuses can only be changed through the ambulance dispatch workflow.")
    row = owned(db, user)
    if status in LIVE_STATUSES and (row.get("latitude") is None or row.get("longitude") is None or (float(row["latitude"]) == 0 and float(row["longitude"]) == 0)):
        raise HTTPException(status_code=409, detail="Real device GPS is required before the ambulance can become dispatchable.")
    ts = now()
    updated = db.execute(text("update ambulances set status=:status,is_active=:active,last_updated=:now where id=:id returning *"), {"status": status, "active": status != "offline", "now": ts, "id": row["id"]}).mappings().first()
    db.commit()
    return {"success": True, "ambulance": public(dict(updated))}


class LocationRequest(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    accuracy_m: float | None = Field(default=None, ge=0, le=100000)
    heading: float | None = None
    speed_mps: float | None = Field(default=None, ge=0)
    emergency_id: int | None = None


@router.patch("/my-location")
def my_location(payload: LocationRequest, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    if user.get("role") != "ambulance":
        raise HTTPException(status_code=403, detail="Ambulance provider access required.")
    if payload.latitude == 0 and payload.longitude == 0:
        raise HTTPException(status_code=400, detail="Invalid GPS position.")
    row = owned(db, user)
    ts = now()
    updated = db.execute(text("""
        update ambulances set latitude=:lat,longitude=:lon,gps_accuracy_m=:accuracy,
          gps_source='provider_device',location_updated_at=:now,last_updated=:now
        where id=:id returning *
    """), {"lat": payload.latitude, "lon": payload.longitude, "accuracy": payload.accuracy_m, "now": ts, "id": row["id"]}).mappings().first()
    db.execute(text("""
        insert into location_updates(ambulance_id,emergency_id,latitude,longitude,accuracy_meters,heading_degrees,speed_mps,recorded_at)
        values(:aid,:eid,:lat,:lon,:accuracy,:heading,:speed,:now)
    """), {"aid": row["id"], "eid": payload.emergency_id, "lat": payload.latitude, "lon": payload.longitude, "accuracy": payload.accuracy_m, "heading": payload.heading, "speed": payload.speed_mps, "now": ts})
    db.commit()
    return {"success": True, "ambulance": public(dict(updated))}
