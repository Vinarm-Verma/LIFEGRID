"""
LIFEGRID STEP 2 — Real Hospital Directory

This router provides:
1. Authenticated hospital directory reads from the LIFEGRID database.
2. Live discovery of nearby real hospitals from OpenStreetMap/Overpass.
3. Coordinator/admin synchronization of discovered hospitals into LIFEGRID.

Important:
- OpenStreetMap is a discovery source, not proof of emergency readiness.
- HFR/ABDM is the intended authoritative health-facility directory source.
- ICU/beds/ventilator/emergency capability are NOT fabricated from directory data.
- Only verified/provider-linked records should participate in emergency matching.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from math import atan2, cos, radians, sin, sqrt
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_roles
from app.database.database import get_db
from app.models.hospital import Hospital


router = APIRouter(
    prefix="/hospitals",
    tags=["Hospitals"],
)

OVERPASS_URL = os.getenv(
    "OVERPASS_URL",
    "https://overpass-api.de/api/interpreter",
).strip()

OSM_SOURCE_URL = "https://www.openstreetmap.org/"


def _distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    earth_radius_km = 6371.0088

    phi1 = radians(lat1)
    phi2 = radians(lat2)
    d_phi = radians(lat2 - lat1)
    d_lambda = radians(lon2 - lon1)

    a = (
        sin(d_phi / 2) ** 2
        + cos(phi1) * cos(phi2) * sin(d_lambda / 2) ** 2
    )

    return earth_radius_km * 2 * atan2(sqrt(a), sqrt(max(0.0, 1 - a)))


def _validate_coordinates(latitude: float, longitude: float) -> None:
    if not -90 <= latitude <= 90:
        raise HTTPException(status_code=400, detail="Invalid latitude.")

    if not -180 <= longitude <= 180:
        raise HTTPException(status_code=400, detail="Invalid longitude.")


def _hospital_to_dict(hospital: Hospital) -> dict:
    return {
        "id": hospital.id,
        "name": hospital.name,
        "address": hospital.address,
        "city": hospital.city,
        "state": hospital.state,
        "latitude": hospital.latitude,
        "longitude": hospital.longitude,
        "emergency_capability": bool(hospital.emergency_capability),
        "trauma_capability": bool(hospital.trauma_capability),
        "icu_available": hospital.icu_available,
        "ventilators_available": hospital.ventilators_available,
        "emergency_beds_available": hospital.emergency_beds_available,
        "availability_status": getattr(hospital, "availability_status", "unknown"),
        "emergency_accepting": bool(getattr(hospital, "emergency_accepting", False)),
        "icu_beds_available": getattr(hospital, "icu_beds_available", hospital.icu_available),
        "capacity_source": getattr(hospital, "capacity_source", "unverified"),
        "capacity_updated_at": getattr(hospital, "capacity_updated_at", None),
        "capacity_verified_at": getattr(hospital, "capacity_verified_at", None),
        "capacity_stale_after_minutes": getattr(hospital, "capacity_stale_after_minutes", 30),
        "is_active": bool(hospital.is_active),
        "owner_auth_user_id": getattr(
            hospital,
            "owner_auth_user_id",
            None,
        ),
        "data_source": getattr(
            hospital,
            "data_source",
            "unknown",
        ),
        "verification_status": getattr(
            hospital,
            "verification_status",
            "unknown",
        ),
        "last_directory_sync_at": (
            getattr(hospital, "last_directory_sync_at", None)
            or getattr(hospital, "directory_last_seen_at", None)
        ),
        "phone": getattr(hospital, "phone", None),
        "website": getattr(hospital, "website", None),
    }


def _osm_hospital_to_dict(
    element: dict,
    latitude: float,
    longitude: float,
) -> dict:
    tags = element.get("tags") or {}

    element_lat = element.get("lat")
    element_lon = element.get("lon")

    if element_lat is None or element_lon is None:
        center = element.get("center") or {}
        element_lat = center.get("lat")
        element_lon = center.get("lon")

    if element_lat is None or element_lon is None:
        raise ValueError("OSM element has no coordinates.")

    element_lat = float(element_lat)
    element_lon = float(element_lon)

    address_parts = [
        tags.get("addr:housenumber"),
        tags.get("addr:street"),
        tags.get("addr:suburb"),
    ]

    address = ", ".join(
        str(value).strip()
        for value in address_parts
        if value
    )

    city = (
        tags.get("addr:city")
        or tags.get("addr:town")
        or tags.get("addr:village")
        or ""
    )

    state = tags.get("addr:state") or ""

    source_record_id = (
        f"{element.get('type', 'unknown')}/{element.get('id')}"
    )

    return {
        "source_record_id": source_record_id,
        "source_url": (
            f"https://www.openstreetmap.org/"
            f"{element.get('type', 'node')}/{element.get('id')}"
        ),
        "name": (
            tags.get("name")
            or tags.get("official_name")
            or "Unnamed hospital"
        ),
        "address": address,
        "city": city,
        "state": state,
        "latitude": element_lat,
        "longitude": element_lon,
        "phone": tags.get("phone") or tags.get("contact:phone"),
        "website": tags.get("website") or tags.get("contact:website"),
        "directory_emergency_tag": (
            str(tags.get("emergency") or "").lower()
            in {"yes", "24/7", "hospital"}
        ),
        "distance_km": round(
            _distance_km(
                latitude,
                longitude,
                element_lat,
                element_lon,
            ),
            3,
        ),
        "data_source": "openstreetmap",
        "verification_status": "unverified",
        "matching_eligible": False,
        "matching_note": (
            "Directory discovery only. Emergency readiness, ICU and "
            "bed capacity require verified provider data."
        ),
    }


def _query_overpass(
    latitude: float,
    longitude: float,
    radius_km: float,
) -> list[dict]:
    radius_m = int(max(500, min(radius_km * 1000, 50000)))

    query = f"""
[out:json][timeout:25];
(
  nwr["amenity"="hospital"](around:{radius_m},{latitude},{longitude});
  nwr["healthcare"="hospital"](around:{radius_m},{latitude},{longitude});
);
out center tags;
""".strip()

    body = urlencode({"data": query}).encode("utf-8")

    request = Request(
        OVERPASS_URL,
        data=body,
        headers={
            "User-Agent": "LIFEGRID/2.0 hospital-directory-sync",
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=35) as response:
            raw = response.read().decode("utf-8")
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "Real hospital directory lookup failed. "
                f"Overpass error: {exc}"
            ),
        ) from exc

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502,
            detail="Hospital directory returned invalid JSON.",
        ) from exc

    return payload.get("elements") or []


@router.get("")
def get_hospitals(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    visible_ids = db.execute(
        text("""
            select id
            from hospitals
            where is_active = true
              and coalesce(data_source, 'manual') <> 'legacy_seed'
            order by name asc
        """),
    ).scalars().all()

    hospitals = (
        db.query(Hospital)
        .filter(
            Hospital.is_active.is_(True),
            Hospital.id.in_(visible_ids),
        )
        .order_by(Hospital.name.asc())
        .all()
    ) if visible_ids else []

    return {
        "success": True,
        "count": len(hospitals),
        "hospitals": [
            _hospital_to_dict(hospital)
            for hospital in hospitals
        ],
    }


class HospitalAvailabilityUpdate(BaseModel):
    availability_status: str
    emergency_accepting: bool
    emergency_beds_available: int = Field(ge=0, le=100000)
    icu_beds_available: int = Field(ge=0, le=100000)
    ventilators_available: int = Field(ge=0, le=100000)
    emergency_capability: bool = True
    trauma_capability: bool = False
    stale_after_minutes: int = Field(default=30, ge=5, le=1440)


@router.get("/my-availability")
def get_my_availability(
    db: Session = Depends(get_db),
    user: dict = Depends(require_roles("hospital")),
):
    row = db.execute(
        text("""
            select id, name, verification_status, availability_status,
                   emergency_accepting, emergency_capability, trauma_capability,
                   emergency_beds_available, icu_beds_available,
                   icu_available, ventilators_available, capacity_source,
                   capacity_updated_at, capacity_verified_at,
                   capacity_stale_after_minutes
            from hospitals
            where owner_auth_user_id=:uid
            limit 1
        """),
        {"uid": str(user["id"])},
    ).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="No hospital facility is linked to this account.")

    return {"success": True, "hospital": dict(row)}


@router.patch("/my-availability")
def update_my_availability(
    payload: HospitalAvailabilityUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_roles("hospital")),
):
    status = payload.availability_status.strip().lower()
    allowed = {"open", "limited", "full", "closed", "offline", "unknown"}
    if status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"availability_status must be one of: {', '.join(sorted(allowed))}",
        )

    if status in {"closed", "offline", "full"} and payload.emergency_accepting:
        raise HTTPException(
            status_code=400,
            detail="A closed, offline, or full facility cannot be marked emergency-accepting.",
        )

    if not payload.emergency_accepting and status == "open":
        status = "limited"

    now = datetime.now(timezone.utc)
    result = db.execute(
        text("""
            update hospitals
            set availability_status=:status,
                emergency_accepting=:accepting,
                emergency_capability=:emergency_capability,
                trauma_capability=:trauma_capability,
                emergency_beds_available=:beds,
                icu_beds_available=:icu_beds,
                icu_available=:icu_beds,
                ventilators_available=:ventilators,
                capacity_source='provider',
                capacity_updated_at=:now,
                capacity_stale_after_minutes=:stale_after,
                verification_status=case
                    when verification_status='unverified' then 'provider_claimed'
                    else verification_status
                end,
                is_active=true
            where owner_auth_user_id=:uid
            returning id, name, verification_status, availability_status,
                      emergency_accepting, emergency_capability, trauma_capability,
                      emergency_beds_available, icu_beds_available,
                      icu_available, ventilators_available, capacity_source,
                      capacity_updated_at, capacity_verified_at,
                      capacity_stale_after_minutes
        """),
        {
            "status": status,
            "accepting": payload.emergency_accepting,
            "emergency_capability": payload.emergency_capability,
            "trauma_capability": payload.trauma_capability,
            "beds": payload.emergency_beds_available,
            "icu_beds": payload.icu_beds_available,
            "ventilators": payload.ventilators_available,
            "stale_after": payload.stale_after_minutes,
            "now": now,
            "uid": str(user["id"]),
        },
    ).mappings().first()

    if not result:
        db.rollback()
        raise HTTPException(status_code=404, detail="No hospital facility is linked to this account.")

    db.commit()
    return {
        "success": True,
        "hospital": dict(result),
        "message": "Hospital operational availability updated.",
    }


@router.get("/nearby-live")
def nearby_real_hospitals(
    latitude: float = Query(...),
    longitude: float = Query(...),
    radius_km: float = Query(
        25.0,
        ge=0.5,
        le=50.0,
    ),
    user: dict = Depends(get_current_user),
):
    _validate_coordinates(latitude, longitude)

    elements = _query_overpass(
        latitude=latitude,
        longitude=longitude,
        radius_km=radius_km,
    )

    hospitals = []

    for element in elements:
        try:
            hospitals.append(
                _osm_hospital_to_dict(
                    element,
                    latitude,
                    longitude,
                )
            )
        except (TypeError, ValueError):
            continue

    hospitals.sort(
        key=lambda item: item["distance_km"]
    )

    return {
        "success": True,
        "source": "OpenStreetMap",
        "source_url": OSM_SOURCE_URL,
        "center": {
            "latitude": latitude,
            "longitude": longitude,
        },
        "radius_km": radius_km,
        "count": len(hospitals),
        "hospitals": hospitals,
        "verification_notice": (
            "These are real directory/discovery records. "
            "They are not evidence of live beds, ICU, ventilators, "
            "emergency acceptance, or ambulance availability."
        ),
    }


@router.post("/sync-nearby")
def sync_nearby_hospitals(
    latitude: float = Query(...),
    longitude: float = Query(...),
    radius_km: float = Query(
        25.0,
        ge=0.5,
        le=50.0,
    ),
    db: Session = Depends(get_db),
    user: dict = Depends(
        require_roles(
            "coordinator",
            "admin",
        )
    ),
):
    _validate_coordinates(latitude, longitude)

    elements = _query_overpass(
        latitude=latitude,
        longitude=longitude,
        radius_km=radius_km,
    )

    now = datetime.now(timezone.utc)

    created = 0
    updated = 0
    skipped = 0
    synced = []

    for element in elements:
        try:
            item = _osm_hospital_to_dict(
                element,
                latitude,
                longitude,
            )
        except (TypeError, ValueError):
            skipped += 1
            continue

        source_record_id = item["source_record_id"]

        existing = db.execute(
            text(
                """
                select id, owner_auth_user_id
                from hospitals
                where data_source = :source
                  and source_record_id = :source_record_id
                limit 1
                """
            ),
            {
                "source": "openstreetmap",
                "source_record_id": source_record_id,
            },
        ).mappings().first()

        if existing:
            # Never overwrite provider-owned operational fields.
            db.execute(
                text(
                    """
                    update hospitals
                    set name = :name,
                        address = coalesce(nullif(:address, ''), address),
                        city = coalesce(nullif(:city, ''), city),
                        state = coalesce(nullif(:state, ''), state),
                        latitude = :latitude,
                        longitude = :longitude,
                        phone = coalesce(nullif(:phone, ''), phone),
                        website = coalesce(nullif(:website, ''), website),
                        source_url = :source_url,
                        directory_emergency_tag = :directory_emergency_tag,
                        directory_last_seen_at = :now,
                        last_directory_sync_at = :now
                    where id = :id
                    """
                ),
                {
                    "name": item["name"],
                    "address": item["address"],
                    "city": item["city"],
                    "state": item["state"],
                    "latitude": item["latitude"],
                    "longitude": item["longitude"],
                    "phone": item["phone"],
                    "website": item["website"],
                    "source_url": item["source_url"],
                    "directory_emergency_tag": item[
                        "directory_emergency_tag"
                    ],
                    "now": now,
                    "id": existing["id"],
                },
            )
            updated += 1
            hospital_id = int(existing["id"])
        else:
            result = db.execute(
                text(
                    """
                    insert into hospitals
                    (
                        name,
                        address,
                        city,
                        state,
                        latitude,
                        longitude,
                        emergency_capability,
                        trauma_capability,
                        icu_available,
                        ventilators_available,
                        emergency_beds_available,
                        is_active,
                        created_at,
                        data_source,
                        source_record_id,
                        source_url,
                        verification_status,
                        last_directory_sync_at,
                        phone,
                        website,
                        directory_emergency_tag,
                        directory_last_seen_at
                    )
                    values
                    (
                        :name,
                        :address,
                        :city,
                        :state,
                        :latitude,
                        :longitude,
                        false,
                        false,
                        0,
                        0,
                        0,
                        true,
                        :now,
                        'openstreetmap',
                        :source_record_id,
                        :source_url,
                        'unverified',
                        :now,
                        :phone,
                        :website,
                        :directory_emergency_tag,
                        :now
                    )
                    returning id
                    """
                ),
                {
                    "name": item["name"],
                    "address": item["address"],
                    "city": item["city"],
                    "state": item["state"],
                    "latitude": item["latitude"],
                    "longitude": item["longitude"],
                    "now": now,
                    "source_record_id": source_record_id,
                    "source_url": item["source_url"],
                    "phone": item["phone"],
                    "website": item["website"],
                    "directory_emergency_tag": item[
                        "directory_emergency_tag"
                    ],
                },
            )

            hospital_id = int(result.scalar_one())
            created += 1

        synced.append(
            {
                "id": hospital_id,
                "name": item["name"],
                "city": item["city"],
                "distance_km": item["distance_km"],
                "verification_status": (
                    "existing_provider_data"
                    if existing
                    and existing["owner_auth_user_id"]
                    else "unverified"
                ),
            }
        )

    db.commit()

    synced.sort(
        key=lambda item: item["distance_km"]
    )

    return {
        "success": True,
        "source": "OpenStreetMap",
        "center": {
            "latitude": latitude,
            "longitude": longitude,
        },
        "radius_km": radius_km,
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "count": len(synced),
        "hospitals": synced,
        "message": (
            "Real hospital directory records synchronized. "
            "Operational capabilities remain unverified until a "
            "hospital/provider claims and verifies the facility."
        ),
    }


@router.get("/{hospital_id}")
def get_hospital(
    hospital_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    hospital = (
        db.query(Hospital)
        .filter(
            Hospital.id == hospital_id,
            Hospital.is_active.is_(True),
        )
        .first()
    )

    if not hospital:
        raise HTTPException(
            status_code=404,
            detail="Hospital not found.",
        )

    return {
        "success": True,
        "hospital": _hospital_to_dict(hospital),
    }
