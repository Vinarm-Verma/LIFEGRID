"""LIFEGRID Step 5 — real ambulance matching and dispatch locking.

No demo ambulance recycling, simulated movement, or automatic reuse of old
assignments. Coordinators/admins create a dispatch; the authenticated
ambulance provider accepts/rejects it and then drives the real status flow.
"""
import json
import math
import os
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database.database import get_db, IS_SQLITE
from app.models.emergency import Emergency

router = APIRouter(prefix="/matching", tags=["Matching"])

COORDINATOR_ROLES = {"coordinator", "admin"}
ACTIVE_DISPATCH_STATUSES = {"assigned", "accepted", "en_route", "arrived", "transporting"}
DRIVER_STATUSES = {"accepted", "en_route", "arrived", "transporting", "completed", "rejected", "cancelled"}


def now_utc():
    return datetime.now(timezone.utc)


def freshness_minutes():
    try:
        return max(1, int(os.getenv("LIFEGRID_AMBULANCE_GPS_MAX_AGE_MINUTES", "2")))
    except ValueError:
        return 2


def distance_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    a1, a2 = math.radians(float(lat1)), math.radians(float(lat2))
    dlat = math.radians(float(lat2) - float(lat1))
    dlon = math.radians(float(lon2) - float(lon1))
    a = math.sin(dlat / 2) ** 2 + math.cos(a1) * math.cos(a2) * math.sin(dlon / 2) ** 2
    return r * (2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))


def parse_required(value):
    if value is None:
        return []
    if isinstance(value, list):
        return value
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []


def _fresh_gps_clause():
    cutoff = now_utc() - timedelta(minutes=freshness_minutes())
    return cutoff


def as_utc_datetime(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        result = value
    else:
        try:
            result = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
    if result.tzinfo is None:
        result = result.replace(tzinfo=timezone.utc)
    return result.astimezone(timezone.utc)


def rank_ambulances(db: Session, emergency: Emergency):
    cutoff = _fresh_gps_clause()
    rows = db.execute(text("""
        select id, vehicle_number, provider_name, ambulance_type,
               latitude, longitude, status, oxygen_available,
               ventilator_available, paramedic_available,
               verification_status, gps_source, location_updated_at,
               gps_accuracy_m, owner_auth_user_id, last_updated
        from ambulances
        where is_active = true
          and status = 'available'
          and latitude is not null and longitude is not null
          and latitude between -90 and 90 and longitude between -180 and 180
          and not (latitude = 0 and longitude = 0)
        order by coalesce(location_updated_at, last_updated) desc
    """)).mappings().all()

    local_demo = IS_SQLITE and os.getenv("LIFEGRID_LOCAL_DEMO", "true").lower() in {"1", "true", "yes", "on"}
    severity = str(emergency.severity or "").lower()
    ranked = []
    for a in rows:
        location_updated = a.get("location_updated_at") or a.get("last_updated")
        location_updated = as_utc_datetime(location_updated)
        if location_updated is None:
            continue

        verified = str(a.get("verification_status") or "").lower() in {"verified", "provider_claimed"}
        provider_gps = str(a.get("gps_source") or "").lower() == "provider_device"
        owned = a.get("owner_auth_user_id") is not None
        fresh = location_updated >= cutoff

        # Local development ships with three seeded ambulances. They are
        # intentionally available for offline end-to-end demos. Production
        # deployments remain strict and require an owned, verified provider
        # device with fresh GPS.
        if not (owned and verified and provider_gps and fresh):
            if not (local_demo and fresh):
                continue

        d = distance_km(emergency.latitude, emergency.longitude, a["latitude"], a["longitude"])
        score = 100 - min(d * 8, 50)
        if severity in {"critical", "high"} and str(a["ambulance_type"] or "").lower() == "advanced": score += 12
        if a["oxygen_available"]: score += 5
        if severity == "critical" and a["ventilator_available"]: score += 8
        if a["paramedic_available"]: score += 5
        age_seconds = max(0, (now_utc() - location_updated.astimezone(timezone.utc)).total_seconds())
        freshness_score = max(0, 10 - age_seconds / 12)
        score += freshness_score
        ranked.append({
            "id": a["id"], "vehicle_number": a["vehicle_number"], "provider_name": a["provider_name"],
            "ambulance_type": a["ambulance_type"], "status": a["status"], "latitude": a["latitude"],
            "longitude": a["longitude"], "oxygen_available": a["oxygen_available"],
            "ventilator_available": a["ventilator_available"], "paramedic_available": a["paramedic_available"],
            "verification_status": a["verification_status"], "gps_source": a["gps_source"],
            "location_updated_at": location_updated, "gps_accuracy_m": a["gps_accuracy_m"],
            "distance_km": round(d, 2),
            "gps_age_seconds": round(age_seconds),
            "matching_score": round(min(score, 100), 2),
        })
    ranked.sort(key=lambda x: (-x["matching_score"], x["distance_km"]))
    return ranked


def rank_hospitals(db: Session, emergency: Emergency):
    """Return verified, currently accepting hospitals ranked for an emergency.

    The original implementation used PostgreSQL-only ``make_interval`` and
    ``now()`` expressions. LIFEGRID also supports the local SQLite development
    database, so freshness is evaluated in Python after a portable query.
    """
    rows = db.execute(text("""
        select id,name,address,city,state,latitude,longitude,
               emergency_capability,trauma_capability,icu_available,
               ventilators_available,emergency_beds_available,
               coalesce(verification_status, 'verified') as verification_status,
               coalesce(availability_status, 'open') as availability_status,
               coalesce(emergency_accepting, true) as emergency_accepting,
               capacity_updated_at,
               coalesce(capacity_stale_after_minutes, 30) as capacity_stale_after_minutes
        from hospitals
        where is_active = true
          and latitude is not null and longitude is not null
          and not (latitude = 0 and longitude = 0)
        order by id
    """)).mappings().all()

    emergency_type = str(emergency.emergency_type or "").lower()
    severity = str(emergency.severity or "").lower()
    now = now_utc()
    ranked = []

    for h in rows:
        if str(h.get("verification_status") or "").lower() not in {"verified", "provider_claimed"}:
            continue
        if str(h.get("availability_status") or "").lower() not in {"open", "limited"}:
            continue
        if not bool(h.get("emergency_accepting")):
            continue

        updated = as_utc_datetime(h.get("capacity_updated_at"))
        if updated is not None:
            stale_after = max(5, int(h.get("capacity_stale_after_minutes") or 30))
            if updated < now - timedelta(minutes=stale_after):
                continue

        d = distance_km(
            emergency.latitude,
            emergency.longitude,
            h["latitude"],
            h["longitude"],
        )
        capability = (
            (15 if h["emergency_capability"] else 0)
            + (15 if severity in {"critical", "high"} and h["trauma_capability"] else 0)
        )
        specialty = (
            25
            if emergency_type in {"road_accident", "fall_injury"} and h["trauma_capability"]
            else 20
            if emergency_type == "medical_emergency" and h["emergency_capability"]
            else 15
            if h["emergency_capability"]
            else 0
        )
        availability = (
            (10 if (h["emergency_beds_available"] or 0) > 0 else 0)
            + (5 if (h["icu_available"] or 0) > 0 else 0)
            + (5 if (h["ventilators_available"] or 0) > 0 else 0)
        )
        distance_score = max(0, 15 - min(d * 2, 15))
        score = min(round(capability + specialty + availability + distance_score, 2), 100)

        ranked.append({
            "id": h["id"],
            "name": h["name"],
            "address": h["address"],
            "city": h["city"],
            "state": h["state"],
            "latitude": h["latitude"],
            "longitude": h["longitude"],
            "emergency_capability": h["emergency_capability"],
            "trauma_capability": h["trauma_capability"],
            "icu_available": h["icu_available"],
            "ventilators_available": h["ventilators_available"],
            "emergency_beds_available": h["emergency_beds_available"],
            "availability_status": h["availability_status"],
            "emergency_accepting": h["emergency_accepting"],
            "distance_km": round(d, 2),
            "matching_score": score,
        })

    ranked.sort(key=lambda x: (-x["matching_score"], x["distance_km"]))
    return ranked


@router.get("/emergency/{emergency_id}")
def get_emergency_matching(emergency_id: int, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    if user.get("role") not in COORDINATOR_ROLES:
        raise HTTPException(status_code=403, detail="Coordinator/admin access required.")
    emergency = db.get(Emergency, emergency_id)
    if not emergency:
        raise HTTPException(status_code=404, detail="Emergency not found.")
    return {
        "emergency_id": emergency.id,
        "severity": emergency.severity,
        "severity_score": emergency.severity_score,
        "required_resources": parse_required(emergency.required_resources),
        "recommended_ambulance": (rank_ambulances(db, emergency) or [None])[0],
        "ranked_ambulances": rank_ambulances(db, emergency),
        "recommended_hospital": (rank_hospitals(db, emergency) or [None])[0],
        "ranked_hospitals": rank_hospitals(db, emergency),
    }


@router.post("/emergency/{emergency_id}/coordinate")
def coordinate_emergency(emergency_id: int, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    if user.get("role") not in COORDINATOR_ROLES:
        raise HTTPException(status_code=403, detail="Only coordinators/admins can dispatch an ambulance.")

    emergency = db.get(Emergency, emergency_id)
    if not emergency:
        raise HTTPException(status_code=404, detail="Emergency not found.")

    active = db.execute(text("""
        select id, ambulance_id, hospital_id, status from lifegrid_dispatch_assignments
        where emergency_id=:eid and status in ('assigned','accepted','en_route','arrived','transporting')
        order by id desc limit 1
    """), {"eid": emergency_id}).mappings().first()
    if active:
        return {"success": True, "status": active["status"], "emergency_id": emergency_id, "assignment_id": active["id"], "ambulance_id": active["ambulance_id"], "hospital_id": active["hospital_id"], "message": "An active dispatch already exists for this emergency."}

    ambulances = rank_ambulances(db, emergency)
    if not ambulances:
        raise HTTPException(status_code=409, detail=f"No verified ambulance with fresh provider GPS is currently available. GPS must be updated within {freshness_minutes()} minutes.")
    hospitals = rank_hospitals(db, emergency)
    if not hospitals:
        raise HTTPException(status_code=409, detail="No verified hospital with current availability is available for this emergency.")

    selected = ambulances[0]
    hospital = hospitals[0]
    # Lock the exact ambulance row and re-check every dispatch condition.
    locked = db.execute(text("""
        select id,status,owner_auth_user_id,verification_status,gps_source,location_updated_at,latitude,longitude
        from ambulances where id=:aid
    """), {"aid": selected["id"]}).mappings().first()
    local_demo = IS_SQLITE and os.getenv("LIFEGRID_LOCAL_DEMO", "true").lower() in {"1", "true", "yes", "on"}
    locked_updated = locked.get("location_updated_at")
    if locked_updated is None:
        # Legacy local seed records use last_updated as their GPS timestamp.
        locked_updated = db.execute(text("select last_updated from ambulances where id=:aid"), {"aid": selected["id"]}).scalar_one_or_none()
    locked_updated = as_utc_datetime(locked_updated)
    strict_valid = (
        locked
        and locked["status"] == "available"
        and locked["owner_auth_user_id"] is not None
        and locked["verification_status"] in ("verified", "provider_claimed")
        and locked["gps_source"] == "provider_device"
        and locked_updated is not None
        and locked_updated >= _fresh_gps_clause()
    )
    demo_valid = local_demo and locked and locked["status"] == "available" and locked_updated is not None and locked_updated >= _fresh_gps_clause()
    if not (strict_valid or demo_valid):
        db.rollback()
        raise HTTPException(status_code=409, detail="The selected ambulance changed state or its GPS became stale. Refresh matching and try again.")

    # The unique partial index is the final database-level race guard.
    try:
        result = db.execute(text("""
            insert into lifegrid_dispatch_assignments
              (emergency_id,ambulance_id,hospital_id,assigned_by,status,assigned_at,updated_at)
            values (:eid,:aid,:hid,:uid,'assigned',:now,:now)
            returning id
        """), {"eid": emergency_id, "aid": locked["id"], "hid": hospital["id"], "uid": str(user["id"]), "now": now_utc()})
        assignment_id = result.scalar_one()
        db.execute(text("update ambulances set status='assigned', last_updated=:now where id=:aid"), {"now": now_utc(), "aid": locked["id"]})
        emergency.assigned_ambulance_id = locked["id"]
        emergency.selected_hospital_id = hospital["id"]
        emergency.status = "coordinated"
        emergency.updated_at = now_utc()

        # Create the hospital response request in the same transaction.
        # The hospital must explicitly accept/reject it through the authenticated
        # hospital-response endpoint.
        db.execute(text("""
            insert into emergency_hospital_responses
              (emergency_id, hospital_id, status, responded_at, updated_at)
            values (:eid, :hid, 'requested', :now, :now)
            on conflict (emergency_id) do update set
              hospital_id = excluded.hospital_id,
              status = 'requested',
              updated_at = excluded.updated_at
        """), {
            "eid": emergency_id,
            "hid": hospital["id"],
            "now": now_utc(),
        })
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Dispatch lock failed because the ambulance is already assigned to another active emergency. Refresh matching.") from exc

    return {"success": True, "status": "assigned", "emergency_id": emergency_id, "assignment_id": assignment_id, "recommended_ambulance": selected, "recommended_hospital": hospital, "message": "Real ambulance dispatch created and locked to this emergency. Awaiting provider acceptance."}


@router.get("/my-assignment")
def my_assignment(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    if user.get("role") != "ambulance":
        raise HTTPException(status_code=403, detail="Ambulance provider access required.")
    row = db.execute(text("""
        select a.id,a.emergency_id,a.ambulance_id,a.hospital_id,a.status,a.assigned_at,
               a.accepted_at,a.rejected_at,a.en_route_at,a.arrived_at,a.transporting_at,
               a.completed_at,a.rejection_reason,a.updated_at,
               e.emergency_type,e.description,e.severity,e.latitude as emergency_latitude,
               e.longitude as emergency_longitude,h.name as hospital_name,h.address as hospital_address
        from lifegrid_dispatch_assignments a
        join ambulances amb on amb.id=a.ambulance_id
        join emergencies e on e.id=a.emergency_id
        left join hospitals h on h.id=a.hospital_id
        where a.status in ('assigned','accepted','en_route','arrived','transporting')
          and (amb.owner_auth_user_id=:uid
               or (:local_demo = 1 and amb.vehicle_number like 'LG-AMB-%'))
        order by a.id desc limit 1
    """), {
        "uid": str(user["id"]),
        "local_demo": int(IS_SQLITE and os.getenv("LIFEGRID_LOCAL_DEMO", "true").lower() in {"1", "true", "yes", "on"}),
    }).mappings().first()
    return dict(row) if row else None


class DispatchStatusRequest(BaseModel):
    status: str
    rejection_reason: str = ""


@router.patch("/my-assignment/status")
def update_my_assignment(payload: DispatchStatusRequest, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    if user.get("role") != "ambulance":
        raise HTTPException(status_code=403, detail="Ambulance provider access required.")
    status = payload.status.strip().lower()
    if status not in DRIVER_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid dispatch status.")

    row = db.execute(text("""
        select a.id,a.emergency_id,a.ambulance_id,a.status
        from lifegrid_dispatch_assignments a
        join ambulances amb on amb.id=a.ambulance_id
        where a.status in ('assigned','accepted','en_route','arrived','transporting')
          and (amb.owner_auth_user_id=:uid
               or (:local_demo = 1 and amb.vehicle_number like 'LG-AMB-%'))
        order by a.id desc limit 1
    """), {
        "uid": str(user["id"]),
        "local_demo": int(IS_SQLITE and os.getenv("LIFEGRID_LOCAL_DEMO", "true").lower() in {"1", "true", "yes", "on"}),
    }).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="No active ambulance dispatch is assigned to this account.")

    current = row["status"]
    allowed = {
        "assigned": {"accepted", "rejected", "cancelled"},
        "accepted": {"en_route", "rejected", "cancelled"},
        "en_route": {"arrived", "cancelled"},
        "arrived": {"transporting", "cancelled"},
        "transporting": {"completed", "cancelled"},
    }
    if status not in allowed.get(current, set()):
        raise HTTPException(status_code=409, detail=f"Invalid dispatch transition: {current} -> {status}.")

    now = now_utc()
    timestamp_column = {"accepted":"accepted_at","rejected":"rejected_at","en_route":"en_route_at","arrived":"arrived_at","transporting":"transporting_at","completed":"completed_at","cancelled":"cancelled_at"}.get(status)
    set_parts = ["status=:status", "updated_at=:now"]
    params = {"status": status, "now": now, "id": row["id"]}
    if timestamp_column:
        set_parts.append(f"{timestamp_column}=:now")
    if status == "rejected":
        set_parts.append("rejection_reason=:reason")
        params["reason"] = payload.rejection_reason.strip()[:500] or "Provider rejected the dispatch."

    db.execute(text(f"update lifegrid_dispatch_assignments set {', '.join(set_parts)} where id=:id"), params)
    ambulance_status = {"accepted":"assigned","rejected":"available","en_route":"en_route","arrived":"arrived","transporting":"transporting","completed":"available","cancelled":"available"}[status]
    db.execute(text("update ambulances set status=:status,last_updated=:now where id=:aid"), {"status": ambulance_status, "now": now, "aid": row["ambulance_id"]})
    if status == "rejected":
        db.execute(text("update emergencies set status='active', updated_at=:now where id=:eid and status='coordinated'"), {"now": now, "eid": row["emergency_id"]})
        db.execute(text("update emergencies set assigned_ambulance_id=null where id=:eid and assigned_ambulance_id=:aid"), {"eid": row["emergency_id"], "aid": row["ambulance_id"]})
    elif status == "completed":
        db.execute(text("update emergencies set status='resolved', updated_at=:now where id=:eid"), {"now": now, "eid": row["emergency_id"]})
    db.commit()
    return {"success": True, "assignment_id": row["id"], "emergency_id": row["emergency_id"], "ambulance_id": row["ambulance_id"], "status": status}
