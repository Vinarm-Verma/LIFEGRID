"""LIFEGRID Step 50 - secure provider identity linkage."""

import json
import os
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database.database import get_db

router = APIRouter(prefix="/auth", tags=["Authentication & Onboarding"])

PUBLIC_ROLES = {"citizen"}
PROVIDER_ROLES = {"ambulance", "hospital", "resource_provider"}
ALL_SELF_REGISTER_ROLES = PUBLIC_ROLES | PROVIDER_ROLES
REVIEW_ROLES = {"coordinator", "admin"}


def local_demo_enabled() -> bool:
    return os.getenv("LIFEGRID_LOCAL_DEMO", "false").strip().lower() == "true"


class OnboardingRequest(BaseModel):
    role: str = "citizen"
    full_name: str = ""
    phone: str = ""
    details: dict[str, Any] = Field(default_factory=dict)


class ReviewRequest(BaseModel):
    reason: str = ""


def utc_now():
    return datetime.now(timezone.utc)


def _supabase_settings():
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        raise HTTPException(
            status_code=500,
            detail="SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for account approval.",
        )
    return url, key


def _admin_user_update(user_id: str, app_metadata: dict[str, Any]):
    url, key = _supabase_settings()
    request = Request(
        f"{url}/auth/v1/admin/users/{user_id}",
        method="PUT",
        data=json.dumps({"app_metadata": app_metadata}).encode(),
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=8) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(status_code=502, detail=f"Supabase admin update failed: {detail[:300]}") from exc
    except (URLError, TimeoutError) as exc:
        raise HTTPException(status_code=502, detail="Could not reach Supabase Admin Auth.") from exc


def _requested_role(user: dict, payload_role: str) -> str:
    metadata = user.get("user_metadata") or {}
    metadata_role = str(metadata.get("lifegrid_role_request") or "").strip().lower()
    requested = metadata_role if metadata_role in ALL_SELF_REGISTER_ROLES else payload_role.strip().lower()
    return requested if requested in ALL_SELF_REGISTER_ROLES else "citizen"


def _ensure_profile(db: Session, role: str, details: dict[str, Any], user: dict):
    uid = str(user["id"])
    name = str((user.get("user_metadata") or {}).get("full_name") or "").strip()
    now = utc_now()

    if role == "ambulance":
        vehicle = str(details.get("vehicle_number") or "").strip()
        provider = str(details.get("provider_name") or "").strip()
        kind = str(details.get("ambulance_type") or "basic").strip()
        if not vehicle:
            raise HTTPException(status_code=400, detail="Ambulance vehicle number is required.")

        existing = db.execute(
            text("select id, owner_auth_user_id from ambulances where lower(vehicle_number)=lower(:v) limit 1"),
            {"v": vehicle},
        ).mappings().first()
        if existing and existing["owner_auth_user_id"] not in (None, uid):
            raise HTTPException(status_code=409, detail="This ambulance vehicle is already linked to another account.")

        if existing:
            db.execute(text("""
                update ambulances
                set owner_auth_user_id=:uid,
                    provider_name=coalesce(nullif(:provider,''), provider_name),
                    ambulance_type=coalesce(nullif(:kind,''), ambulance_type),
                    is_active=true,
                    last_updated=:now
                where id=:id
            """), {"uid": uid, "provider": provider, "kind": kind, "now": now, "id": existing["id"]})
            return int(existing["id"])

        result = db.execute(text("""
            insert into ambulances
            (owner_auth_user_id,vehicle_number,provider_name,ambulance_type,latitude,longitude,
             status,oxygen_available,ventilator_available,paramedic_available,is_active,last_updated,
             verification_status,gps_source,location_updated_at)
            values (:uid,:vehicle,:provider,:kind,0,0,'available',false,false,false,true,:now,
                    'verified','provider_device',:now)
            returning id
        """), {
            "uid": uid, "vehicle": vehicle, "provider": provider or name or "Independent",
            "kind": kind, "now": now,
        })
        return int(result.scalar_one())

    if role == "hospital":
        org = str(details.get("organization_name") or "").strip()
        address = str(details.get("address") or "").strip()
        city = str(details.get("city") or "").strip()
        state = str(details.get("state") or "").strip()
        if not org:
            raise HTTPException(status_code=400, detail="Hospital/clinic name is required.")

        existing = db.execute(
            text("select id, owner_auth_user_id from hospitals where lower(name)=lower(:n) limit 1"),
            {"n": org},
        ).mappings().first()
        if existing and existing["owner_auth_user_id"] not in (None, uid):
            raise HTTPException(status_code=409, detail="This hospital is already linked to another account.")

        if existing:
            db.execute(text("""
                update hospitals
                set owner_auth_user_id=:uid,
                    address=coalesce(nullif(:address,''), address),
                    city=coalesce(nullif(:city,''), city),
                    state=coalesce(nullif(:state,''), state),
                    is_active=true
                where id=:id
            """), {"uid": uid, "address": address, "city": city, "state": state, "id": existing["id"]})
            return int(existing["id"])

        result = db.execute(text("""
            insert into hospitals
            (owner_auth_user_id,name,address,city,state,latitude,longitude,emergency_capability,
             trauma_capability,icu_available,ventilators_available,emergency_beds_available,is_active,created_at,
             verification_status,availability_status,emergency_accepting,icu_beds_available,capacity_stale_after_minutes,capacity_source,capacity_updated_at,capacity_verified_at,data_source)
            values (:uid,:name,:address,:city,:state,0,0,true,false,0,0,0,true,:now,
                    'verified','open',true,0,30,'provider_device',:now,:now,'provider')
            returning id
        """), {"uid": uid, "name": org, "address": address, "city": city, "state": state, "now": now})
        return int(result.scalar_one())

    if role == "resource_provider":
        provider = str(details.get("organization_name") or "").strip()
        resource_type = str(details.get("resource_type") or "").strip()
        resource_name = str(details.get("resource_name") or "").strip()
        try:
            quantity = max(0, int(details.get("quantity_available") or 0))
        except (TypeError, ValueError):
            quantity = 0
        if not provider or not resource_type or not resource_name:
            raise HTTPException(status_code=400, detail="Resource provider details are incomplete.")

        result = db.execute(text("""
            insert into resources
            (owner_auth_user_id,provider_name,resource_type,resource_name,quantity_available,
             latitude,longitude,status,verified,last_verified,created_at,is_active)
            values (:uid,:provider,:type,:name,:quantity,0,0,'available',true,:now,:now,true)
            returning id
        """), {
            "uid": uid, "provider": provider, "type": resource_type,
            "name": resource_name, "quantity": quantity, "now": now,
        })
        return int(result.scalar_one())

    return None


@router.post("/onboarding/sync")
def sync_onboarding(payload: OnboardingRequest, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    requested = _requested_role(user, payload.role)
    if requested == "citizen":
        return {"status": "active", "role": "citizen"}

    existing = db.execute(text("""
        select id,status,requested_role,organization_name,rejection_reason,payload
        from account_registrations where auth_user_id=:uid
    """), {"uid": user["id"]}).mappings().first()

    details = payload.details or {}
    if existing:
        # In local demo mode, a previously pending provider is promoted on the
        # next successful login and its provider profile is repaired/created.
        if local_demo_enabled() and existing["status"] != "approved":
            _ensure_profile(db, requested, details, user)
            db.execute(text("""
                update account_registrations
                set status='approved', reviewed_at=:now, rejection_reason=null
                where id=:id
            """), {"now": utc_now(), "id": existing["id"]})
            db.commit()
            return {
                "status": "approved", "role": requested,
                "registration_id": existing["id"],
                "organization_name": existing["organization_name"],
            }

        return {
            "status": existing["status"], "role": existing["requested_role"],
            "registration_id": existing["id"], "organization_name": existing["organization_name"],
            "rejection_reason": existing["rejection_reason"],
        }

    org = str(details.get("organization_name") or details.get("provider_name") or "").strip()
    status = "approved" if local_demo_enabled() else "pending"
    db.execute(text("""
        insert into account_registrations
        (auth_user_id,requested_role,full_name,email,phone,organization_name,payload,status,reviewed_at)
        values (:uid,:role,:name,:email,:phone,:org,:payload,:status,:reviewed_at)
    """), {
        "uid": user["id"], "role": requested,
        "name": payload.full_name.strip() or (user.get("user_metadata") or {}).get("full_name"),
        "email": user.get("email"), "phone": payload.phone.strip(),
        "org": org, "payload": json.dumps(details),
        "status": status, "reviewed_at": utc_now() if status == "approved" else None,
    })

    if local_demo_enabled():
        _ensure_profile(db, requested, details, user)

    db.commit()
    return {"status": status, "role": requested}


@router.get("/onboarding/status")
def onboarding_status(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    row = db.execute(text("""
        select id,requested_role,status,organization_name,rejection_reason,created_at,reviewed_at
        from account_registrations where auth_user_id=:uid
    """), {"uid": user["id"]}).mappings().first()
    if not row:
        return {"status": "active", "role": user["role"]}
    return dict(row)


@router.get("/onboarding/profile")
def own_provider_profile(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    role = user.get("role", "citizen")
    uid = str(user["id"])
    if role == "ambulance":
        row = db.execute(text("select * from ambulances where owner_auth_user_id=:uid limit 1"), {"uid": uid}).mappings().first()
        return {"role": role, "profile": dict(row) if row else None}
    if role == "hospital":
        row = db.execute(text("select * from hospitals where owner_auth_user_id=:uid limit 1"), {"uid": uid}).mappings().first()
        return {"role": role, "profile": dict(row) if row else None}
    if role == "resource_provider":
        rows = db.execute(text("select * from resources where owner_auth_user_id=:uid order by created_at desc"), {"uid": uid}).mappings().all()
        return {"role": role, "profiles": [dict(row) for row in rows]}
    return {"role": role, "profile": None, "profiles": []}


@router.get("/registrations")
def registrations(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    if user["role"] not in REVIEW_ROLES:
        raise HTTPException(status_code=403, detail="Coordinator/admin access required.")
    rows = db.execute(text("""
        select id,auth_user_id,requested_role,full_name,email,phone,organization_name,payload,
               status,rejection_reason,created_at,reviewed_at
        from account_registrations
        order by case when status='pending' then 0 else 1 end, created_at desc
    """)).mappings().all()
    return [dict(row) for row in rows]


@router.post("/registrations/{registration_id}/approve")
def approve_registration(registration_id: int, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    if user["role"] not in REVIEW_ROLES:
        raise HTTPException(status_code=403, detail="Coordinator/admin access required.")

    row = db.execute(text("select * from account_registrations where id=:id for update"), {"id": registration_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Registration not found.")
    if row["status"] != "pending":
        return {"status": row["status"], "registration_id": registration_id}

    details = row["payload"] or {}
    if isinstance(details, str):
        details = json.loads(details)
    role = row["requested_role"]

    # The privileged role is assigned only by the server-side service key.
    _admin_user_update(str(row["auth_user_id"]), {"role": role, "registration_status": "approved"})

    profile_id = _ensure_profile(
        db, role, details,
        {"id": str(row["auth_user_id"]), "email": row["email"], "user_metadata": {"full_name": row["full_name"] or ""}},
    )

    now = utc_now()
    db.execute(text("""
        update account_registrations
        set status='approved', reviewed_by=:reviewer, reviewed_at=:now, updated_at=:now
        where id=:id
    """), {"reviewer": user["id"], "now": now, "id": registration_id})
    db.commit()

    return {
        "status": "approved", "registration_id": registration_id,
        "role": role, "provider_profile_id": profile_id,
        "message": "Account approved. Ask the user to sign in again to receive the new role and provider profile.",
    }


@router.post("/registrations/{registration_id}/reject")
def reject_registration(registration_id: int, payload: ReviewRequest, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    if user["role"] not in REVIEW_ROLES:
        raise HTTPException(status_code=403, detail="Coordinator/admin access required.")

    result = db.execute(text("""
        update account_registrations
        set status='rejected', rejection_reason=:reason, reviewed_by=:reviewer,
            reviewed_at=:now, updated_at=:now
        where id=:id and status='pending'
    """), {
        "reason": payload.reason.strip()[:500] or "Registration was not approved.",
        "reviewer": user["id"], "now": utc_now(), "id": registration_id,
    })
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Pending registration not found.")
    return {"status": "rejected", "registration_id": registration_id}
