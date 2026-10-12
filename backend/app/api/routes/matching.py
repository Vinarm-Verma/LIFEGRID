"""
LIFEGRID real ambulance matching and dispatch.

Operational workflow:

    Citizen
       ↓
    Hospital selected
       ↓
    Hospital accepts
       ↓
    Suitable ambulance matched
       ↓
    Ambulance driver receives assignment
       ↓
    Pickup → En Route → Arrived → Transporting → Completed

Coordinator/admin is NOT required for normal emergency dispatch.
"""

import json
import math
import os

from datetime import datetime, timezone, timedelta

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
)

from pydantic import BaseModel

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth import (
    get_current_user,
)

from app.database.database import (
    get_db,
)

from app.models.emergency import Emergency


router = APIRouter(
    prefix="/matching",
    tags=["Matching"],
)


COORDINATOR_ROLES = {
    "coordinator",
    "admin",
}

DISPATCH_ROLES = {
    "hospital",
    "coordinator",
    "admin",
}

ACTIVE_DISPATCH_STATUSES = {
    "assigned",
    "accepted",
    "en_route",
    "arrived",
    "transporting",
}

DRIVER_STATUSES = {
    "accepted",
    "en_route",
    "arrived",
    "transporting",
    "completed",
    "rejected",
    "cancelled",
}


def now_utc():
    return datetime.now(timezone.utc)


def freshness_minutes():
    try:
        return max(
            1,
            int(
                os.getenv(
                    "LIFEGRID_AMBULANCE_GPS_MAX_AGE_MINUTES",
                    "2",
                )
            ),
        )
    except ValueError:
        return 2


def distance_km(
    lat1,
    lon1,
    lat2,
    lon2,
):
    if (
        lat1 is None
        or lon1 is None
        or lat2 is None
        or lon2 is None
    ):
        return None

    radius = 6371.0

    a1 = math.radians(
        float(lat1)
    )
    a2 = math.radians(
        float(lat2)
    )

    dlat = math.radians(
        float(lat2) - float(lat1)
    )

    dlon = math.radians(
        float(lon2) - float(lon1)
    )

    value = (
        math.sin(dlat / 2) ** 2
        +
        math.cos(a1)
        * math.cos(a2)
        * math.sin(dlon / 2) ** 2
    )

    return radius * (
        2
        * math.atan2(
            math.sqrt(value),
            math.sqrt(
                1 - value
            ),
        )
    )


def parse_required(value):
    if value is None:
        return []

    if isinstance(value, list):
        return value

    try:
        parsed = json.loads(value)

        return (
            parsed
            if isinstance(
                parsed,
                list,
            )
            else []
        )
    except Exception:
        return []


def _fresh_gps_clause():
    return (
        now_utc()
        - timedelta(
            minutes=freshness_minutes()
        )
    )


def rank_ambulances(
    db: Session,
    emergency: Emergency,
):
    if (
        emergency.latitude is None
        or emergency.longitude is None
    ):
        return []

    cutoff = _fresh_gps_clause()

    rows = db.execute(
        text(
            """
            SELECT
                id,
                vehicle_number,
                provider_name,
                ambulance_type,
                latitude,
                longitude,
                status,
                oxygen_available,
                ventilator_available,
                paramedic_available,
                verification_status,
                gps_source,
                location_updated_at,
                gps_accuracy_m
            FROM ambulances
            WHERE is_active = true
              AND owner_auth_user_id IS NOT NULL
              AND status = 'available'
              AND verification_status IN (
                  'verified',
                  'provider_claimed'
              )
              AND gps_source = 'provider_device'
              AND location_updated_at IS NOT NULL
              AND location_updated_at >= :cutoff
              AND latitude IS NOT NULL
              AND longitude IS NOT NULL
              AND latitude BETWEEN -90 AND 90
              AND longitude BETWEEN -180 AND 180
              AND NOT (
                  latitude = 0
                  AND longitude = 0
              )
            ORDER BY location_updated_at DESC
            """
        ),
        {
            "cutoff": cutoff,
        },
    ).mappings().all()

    severity = str(
        emergency.severity or ""
    ).lower()

    ranked = []

    for ambulance in rows:
        distance = distance_km(
            emergency.latitude,
            emergency.longitude,
            ambulance["latitude"],
            ambulance["longitude"],
        )

        if distance is None:
            continue

        score = (
            100
            - min(
                distance * 8,
                50,
            )
        )

        if (
            severity
            in {
                "critical",
                "high",
            }
            and str(
                ambulance[
                    "ambulance_type"
                ]
                or ""
            ).lower()
            == "advanced"
        ):
            score += 12

        if ambulance[
            "oxygen_available"
        ]:
            score += 5

        if (
            severity == "critical"
            and ambulance[
                "ventilator_available"
            ]
        ):
            score += 8

        if ambulance[
            "paramedic_available"
        ]:
            score += 5

        location_updated_at = (
            ambulance[
                "location_updated_at"
            ]
        )

        if location_updated_at.tzinfo:
            location_updated_at = (
                location_updated_at.astimezone(
                    timezone.utc
                )
            )

        age_seconds = max(
            0,
            (
                now_utc()
                - location_updated_at
            ).total_seconds(),
        )

        freshness_score = max(
            0,
            10 - age_seconds / 12,
        )

        score += freshness_score

        ranked.append(
            {
                "id": ambulance["id"],
                "vehicle_number": ambulance[
                    "vehicle_number"
                ],
                "provider_name": ambulance[
                    "provider_name"
                ],
                "ambulance_type": ambulance[
                    "ambulance_type"
                ],
                "status": ambulance[
                    "status"
                ],
                "latitude": ambulance[
                    "latitude"
                ],
                "longitude": ambulance[
                    "longitude"
                ],
                "oxygen_available": ambulance[
                    "oxygen_available"
                ],
                "ventilator_available": ambulance[
                    "ventilator_available"
                ],
                "paramedic_available": ambulance[
                    "paramedic_available"
                ],
                "verification_status": ambulance[
                    "verification_status"
                ],
                "gps_source": ambulance[
                    "gps_source"
                ],
                "location_updated_at": ambulance[
                    "location_updated_at"
                ],
                "gps_accuracy_m": ambulance[
                    "gps_accuracy_m"
                ],
                "distance_km": round(
                    distance,
                    2,
                ),
                "gps_age_seconds": round(
                    age_seconds
                ),
                "matching_score": round(
                    min(
                        score,
                        100,
                    ),
                    2,
                ),
            }
        )

    ranked.sort(
        key=lambda item: (
            -item["matching_score"],
            item["distance_km"],
        )
    )

    return ranked


def rank_hospitals(
    db: Session,
    emergency: Emergency,
):
    if (
        emergency.latitude is None
        or emergency.longitude is None
    ):
        return []


    # Use SQL syntax compatible with the active database.
    database_dialect = db.get_bind().dialect.name

    if database_dialect == "sqlite":
        hospital_query = text("""
            SELECT
                id,
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
                emergency_beds_available
            FROM hospitals
            WHERE is_active = 1
              AND latitude IS NOT NULL
              AND longitude IS NOT NULL
              AND NOT (latitude = 0 AND longitude = 0)
              AND COALESCE(
                    verification_status,
                    'verified'
                  ) IN ('verified', 'provider_claimed')
              AND availability_status IN ('open', 'limited')
              AND emergency_accepting = 1
              AND capacity_updated_at IS NOT NULL
              AND datetime(capacity_updated_at) >= datetime(
                    'now',
                    '-' || MAX(
                        COALESCE(capacity_stale_after_minutes, 30),
                        5
                    ) || ' minutes'
                  )
            ORDER BY id
        """)
    else:
        hospital_query = text("""
            SELECT
                id,
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
                emergency_beds_available
            FROM hospitals
            WHERE is_active = TRUE
              AND latitude IS NOT NULL
              AND longitude IS NOT NULL
              AND NOT (latitude = 0 AND longitude = 0)
              AND COALESCE(
                    verification_status,
                    'verified'
                  ) IN ('verified', 'provider_claimed')
              AND availability_status IN ('open', 'limited')
              AND emergency_accepting = TRUE
              AND capacity_updated_at IS NOT NULL
              AND capacity_updated_at + make_interval(
                    mins => GREATEST(
                        COALESCE(capacity_stale_after_minutes, 30),
                        5
                    )
                  ) >= NOW()
            ORDER BY id
        """)

    rows = db.execute(hospital_query).mappings().all()



    emergency_type = str(
        emergency.emergency_type or ""
    ).lower()

    severity = str(
        emergency.severity or ""
    ).lower()

    ranked = []

    for hospital in rows:
        distance = distance_km(
            emergency.latitude,
            emergency.longitude,
            hospital["latitude"],
            hospital["longitude"],
        )

        if distance is None:
            continue

        capability = (
            15
            if hospital[
                "emergency_capability"
            ]
            else 0
        )

        if (
            severity
            in {
                "critical",
                "high",
            }
            and hospital[
                "trauma_capability"
            ]
        ):
            capability += 15

        if (
            emergency_type
            in {
                "road_accident",
                "fall_injury",
            }
            and hospital[
                "trauma_capability"
            ]
        ):
            specialty = 25

        elif (
            emergency_type
            == "medical_emergency"
            and hospital[
                "emergency_capability"
            ]
        ):
            specialty = 20

        elif hospital[
            "emergency_capability"
        ]:
            specialty = 15

        else:
            specialty = 0

        availability = (
            10
            if (
                hospital[
                    "emergency_beds_available"
                ]
                or 0
            )
            > 0
            else 0
        )

        availability += (
            5
            if (
                hospital[
                    "icu_available"
                ]
                or 0
            )
            > 0
            else 0
        )

        availability += (
            5
            if (
                hospital[
                    "ventilators_available"
                ]
                or 0
            )
            > 0
            else 0
        )

        distance_score = max(
            0,
            15 - min(
                distance * 2,
                15,
            ),
        )

        score = min(
            round(
                capability
                + specialty
                + availability
                + distance_score,
                2,
            ),
            100,
        )

        ranked.append(
            {
                "id": hospital["id"],
                "name": hospital["name"],
                "address": hospital["address"],
                "city": hospital["city"],
                "state": hospital["state"],
                "latitude": hospital[
                    "latitude"
                ],
                "longitude": hospital[
                    "longitude"
                ],
                "emergency_capability": hospital[
                    "emergency_capability"
                ],
                "trauma_capability": hospital[
                    "trauma_capability"
                ],
                "icu_available": hospital[
                    "icu_available"
                ],
                "ventilators_available": hospital[
                    "ventilators_available"
                ],
                "emergency_beds_available": hospital[
                    "emergency_beds_available"
                ],
                "distance_km": round(
                    distance,
                    2,
                ),
                "matching_score": score,
            }
        )

    ranked.sort(
        key=lambda item: (
            -item["matching_score"],
            item["distance_km"],
        )
    )

    return ranked


@router.get(
    "/emergency/{emergency_id}"
)
def get_emergency_matching(
    emergency_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(
        get_current_user
    ),
):
    if (
        user.get("role")
        not in COORDINATOR_ROLES
    ):
        raise HTTPException(
            status_code=403,
            detail=(
                "Coordinator/admin access required."
            ),
        )

    emergency = db.get(
        Emergency,
        emergency_id,
    )

    if not emergency:
        raise HTTPException(
            status_code=404,
            detail="Emergency not found.",
        )

    ambulances = rank_ambulances(
        db,
        emergency,
    )

    hospitals = rank_hospitals(
        db,
        emergency,
    )

    return {
        "emergency_id": emergency.id,
        "severity": emergency.severity,
        "severity_score": emergency.severity_score,
        "required_resources": parse_required(
            emergency.required_resources
        ),
        "recommended_ambulance": (
            ambulances[0]
            if ambulances
            else None
        ),
        "ranked_ambulances": ambulances,
        "recommended_hospital": (
            hospitals[0]
            if hospitals
            else None
        ),
        "ranked_hospitals": hospitals,
    }


@router.post(
    "/emergency/{emergency_id}/coordinate"
)
def coordinate_emergency(
    emergency_id: int,
    hospital_id: int | None = None,
    db: Session = Depends(get_db),
    user: dict = Depends(
        get_current_user
    ),
):
    """
    Create an ambulance assignment.

    Hospital role:
        - Must own the selected hospital.
        - Hospital must have accepted the emergency.
        - Dispatch is created for that hospital only.

    Coordinator/admin:
        - Legacy administrative coordination access remains available
          for compatibility, but is no longer part of the normal
          Citizen -> Hospital -> Ambulance workflow.
    """

    role = user.get("role")

    if role not in DISPATCH_ROLES:
        raise HTTPException(
            status_code=403,
            detail=(
                "Only an authorized hospital or administrator "
                "can create this dispatch."
            ),
        )

    emergency = db.get(
        Emergency,
        emergency_id,
        with_for_update=True,
    )

    if not emergency:
        raise HTTPException(
            status_code=404,
            detail="Emergency not found.",
        )

    active = db.execute(
        text(
            """
            SELECT
                id,
                ambulance_id,
                hospital_id,
                status
            FROM lifegrid_dispatch_assignments
            WHERE emergency_id = :eid
              AND status IN (
                  'assigned',
                  'accepted',
                  'en_route',
                  'arrived',
                  'transporting'
              )
            ORDER BY id DESC
            LIMIT 1
            """
        ),
        {
            "eid": emergency_id,
        },
    ).mappings().first()

    if active:
        return {
            "success": True,
            "status": active["status"],
            "emergency_id": emergency_id,
            "assignment_id": active["id"],
            "ambulance_id": active[
                "ambulance_id"
            ],
            "hospital_id": active[
                "hospital_id"
            ],
            "message": (
                "An active ambulance assignment "
                "already exists for this emergency."
            ),
        }

    selected_hospital = None

    if role == "hospital":
        owned = db.execute(
            text(
                """
                SELECT
                    id,
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
                    availability_status,
                    emergency_accepting
                FROM hospitals
                WHERE owner_auth_user_id = :uid
                  AND is_active = true
                LIMIT 1
                """
            ),
            {
                "uid": str(
                    user["id"]
                ),
            },
        ).mappings().first()

        if not owned:
            raise HTTPException(
                status_code=404,
                detail=(
                    "No active hospital facility is linked "
                    "to this account."
                ),
            )

        if (
            hospital_id is not None
            and int(hospital_id)
            != int(owned["id"])
        ):
            raise HTTPException(
                status_code=403,
                detail=(
                    "This hospital account cannot "
                    "dispatch for another hospital."
                ),
            )

        if (
            emergency.selected_hospital_id
            is not None
            and int(
                emergency.selected_hospital_id
            )
            != int(owned["id"])
        ):
            raise HTTPException(
                status_code=403,
                detail=(
                    "This emergency is assigned "
                    "to a different hospital."
                ),
            )

        if emergency.status not in {
            "hospital_accepted",
            "ambulance_requested",
            "coordinated",
        }:
            raise HTTPException(
                status_code=409,
                detail=(
                    "The hospital must accept this emergency "
                    "before requesting an ambulance."
                ),
            )

        selected_hospital = dict(
            owned
        )

        hospital_id = int(
            owned["id"]
        )

    else:
        hospitals = rank_hospitals(
            db,
            emergency,
        )

        if hospital_id is not None:
            matching = [
                item
                for item in hospitals
                if int(item["id"])
                == int(hospital_id)
            ]

            if not matching:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "The selected hospital is "
                        "not currently available."
                    ),
                )

            selected_hospital = matching[0]
            hospital_id = int(
                selected_hospital["id"]
            )

        elif hospitals:
            selected_hospital = hospitals[0]
            hospital_id = int(
                selected_hospital["id"]
            )

        else:
            raise HTTPException(
                status_code=409,
                detail=(
                    "No verified hospital with "
                    "current availability is available."
                ),
            )

    ambulances = rank_ambulances(
        db,
        emergency,
    )

    if not ambulances:
        raise HTTPException(
            status_code=409,
            detail=(
                "No verified ambulance with fresh provider GPS "
                "is currently available."
            ),
        )

    selected = ambulances[0]

    # SQLite does not support SELECT ... FOR UPDATE. PostgreSQL uses the
    # row lock to prevent two concurrent dispatches from claiming one unit.
    lock_sql = """
        SELECT
            id,
            status,
            owner_auth_user_id,
            verification_status,
            gps_source,
            location_updated_at,
            latitude,
            longitude
        FROM ambulances
        WHERE id = :aid
    """
    if db.get_bind().dialect.name != "sqlite":
        lock_sql += " FOR UPDATE"

    locked = db.execute(
        text(lock_sql),
        {"aid": selected["id"]},
    ).mappings().first()

    if (
        not locked
        or locked["status"]
        != "available"
        or locked[
            "owner_auth_user_id"
        ]
        is None
        or locked[
            "verification_status"
        ]
        not in (
            "verified",
            "provider_claimed",
        )
        or locked["gps_source"]
        != "provider_device"
        or locked[
            "location_updated_at"
        ]
        is None
        or locked[
            "location_updated_at"
        ]
        < _fresh_gps_clause()
    ):
        db.rollback()

        raise HTTPException(
            status_code=409,
            detail=(
                "The selected ambulance changed state "
                "or its GPS became stale. Refresh matching."
            ),
        )

    try:
        assignment_result = db.execute(
            text(
                """
                INSERT INTO lifegrid_dispatch_assignments (
                    emergency_id,
                    ambulance_id,
                    hospital_id,
                    assigned_by,
                    status,
                    assigned_at,
                    updated_at
                )
                VALUES (
                    :eid,
                    :aid,
                    :hid,
                    :uid,
                    'assigned',
                    :now,
                    :now
                )
                RETURNING id
                """
            ),
            {
                "eid": emergency_id,
                "aid": locked["id"],
                "hid": hospital_id,
                "uid": str(
                    user["id"]
                ),
                "now": now_utc(),
            },
        )

        assignment_id = (
            assignment_result.scalar_one()
        )

        db.execute(
            text(
                """
                UPDATE ambulances
                SET
                    status = 'assigned',
                    last_updated = :now
                WHERE id = :aid
                """
            ),
            {
                "now": now_utc(),
                "aid": locked["id"],
            },
        )

        emergency.assigned_ambulance_id = (
            locked["id"]
        )

        emergency.selected_hospital_id = (
            hospital_id
        )

        emergency.status = (
            "ambulance_requested"
        )

        emergency.updated_at = (
            now_utc()
        )

        db.commit()

    except Exception as exc:
        db.rollback()

        raise HTTPException(
            status_code=409,
            detail=(
                "Ambulance dispatch lock failed. "
                "The vehicle may already be assigned."
            ),
        ) from exc

    return {
        "success": True,
        "status": "assigned",
        "emergency_id": emergency_id,
        "assignment_id": assignment_id,
        "ambulance_id": locked["id"],
        "hospital_id": hospital_id,
        "recommended_ambulance": selected,
        "receiving_hospital": selected_hospital,
        "message": (
            "Ambulance assigned to the accepted hospital emergency."
        ),
    }


@router.get(
    "/my-assignment"
)
def my_assignment(
    db: Session = Depends(get_db),
    user: dict = Depends(
        get_current_user
    ),
):
    if user.get("role") != "ambulance":
        raise HTTPException(
            status_code=403,
            detail=(
                "Ambulance provider access required."
            ),
        )

    row = db.execute(
        text(
            """
            SELECT
                a.id,
                a.emergency_id,
                a.ambulance_id,
                a.hospital_id,
                a.status,
                a.assigned_at,
                a.accepted_at,
                a.rejected_at,
                a.en_route_at,
                a.arrived_at,
                a.transporting_at,
                a.completed_at,
                a.rejection_reason,
                a.updated_at,

                e.emergency_type,
                e.description,
                e.patient_count,
                e.severity,
                e.latitude
                    AS emergency_latitude,
                e.longitude
                    AS emergency_longitude,
                e.location_description,

                h.name
                    AS hospital_name,
                h.address
                    AS hospital_address,
                h.city
                    AS hospital_city,
                h.latitude
                    AS hospital_latitude,
                h.longitude
                    AS hospital_longitude

            FROM lifegrid_dispatch_assignments a

            JOIN ambulances amb
                ON amb.id = a.ambulance_id

            JOIN emergencies e
                ON e.id = a.emergency_id

            LEFT JOIN hospitals h
                ON h.id = a.hospital_id

            WHERE amb.owner_auth_user_id = :uid
              AND a.status IN (
                  'assigned',
                  'accepted',
                  'en_route',
                  'arrived',
                  'transporting'
              )

            ORDER BY a.id DESC

            LIMIT 1
            """
        ),
        {
            "uid": str(
                user["id"]
            ),
        },
    ).mappings().first()

    return (
        dict(row)
        if row
        else None
    )


class DispatchStatusRequest(BaseModel):
    status: str
    rejection_reason: str = ""


@router.patch(
    "/my-assignment/status"
)
def update_my_assignment(
    payload: DispatchStatusRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(
        get_current_user
    ),
):
    if user.get("role") != "ambulance":
        raise HTTPException(
            status_code=403,
            detail=(
                "Ambulance provider access required."
            ),
        )

    status = (
        payload.status
        .strip()
        .lower()
    )

    if status not in DRIVER_STATUSES:
        raise HTTPException(
            status_code=400,
            detail="Invalid dispatch status.",
        )

    row = db.execute(
        text(
            """
            SELECT
                a.id,
                a.emergency_id,
                a.ambulance_id,
                a.status
            FROM lifegrid_dispatch_assignments a
            JOIN ambulances amb
                ON amb.id = a.ambulance_id
            WHERE amb.owner_auth_user_id = :uid
              AND a.status IN (
                  'assigned',
                  'accepted',
                  'en_route',
                  'arrived',
                  'transporting'
              )
            ORDER BY a.id DESC
            LIMIT 1
            FOR UPDATE
            """
        ),
        {
            "uid": str(
                user["id"]
            ),
        },
    ).mappings().first()

    if not row:
        raise HTTPException(
            status_code=404,
            detail=(
                "No active ambulance dispatch "
                "is assigned to this account."
            ),
        )

    current = row["status"]

    allowed = {
        "assigned": {
            "accepted",
            "rejected",
            "cancelled",
        },
        "accepted": {
            "en_route",
            "rejected",
            "cancelled",
        },
        "en_route": {
            "arrived",
            "cancelled",
        },
        "arrived": {
            "transporting",
            "cancelled",
        },
        "transporting": {
            "completed",
            "cancelled",
        },
    }

    if status not in allowed.get(
        current,
        set(),
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                f"Invalid dispatch transition: "
                f"{current} -> {status}."
            ),
        )

    stamp = now_utc()

    timestamp_column = {
        "accepted": "accepted_at",
        "rejected": "rejected_at",
        "en_route": "en_route_at",
        "arrived": "arrived_at",
        "transporting": "transporting_at",
        "completed": "completed_at",
        "cancelled": "cancelled_at",
    }.get(status)

    set_parts = [
        "status = :status",
        "updated_at = :now",
    ]

    params = {
        "status": status,
        "now": stamp,
        "id": row["id"],
    }

    if timestamp_column:
        set_parts.append(
            f"{timestamp_column} = :now"
        )

    if status == "rejected":
        set_parts.append(
            "rejection_reason = :reason"
        )

        params["reason"] = (
            payload.rejection_reason
            .strip()[:500]
            or
            "Provider rejected the dispatch."
        )

    db.execute(
        text(
            f"""
            UPDATE lifegrid_dispatch_assignments
            SET {", ".join(set_parts)}
            WHERE id = :id
            """
        ),
        params,
    )

    ambulance_status = {
        "accepted": "assigned",
        "rejected": "available",
        "en_route": "en_route",
        "arrived": "arrived",
        "transporting": "transporting",
        "completed": "available",
        "cancelled": "available",
    }[status]

    db.execute(
        text(
            """
            UPDATE ambulances
            SET
                status = :status,
                last_updated = :now
            WHERE id = :aid
            """
        ),
        {
            "status": ambulance_status,
            "now": stamp,
            "aid": row[
                "ambulance_id"
            ],
        },
    )

    if status == "rejected":
        db.execute(
            text(
                """
                UPDATE emergencies
                SET
                    status = 'hospital_accepted',
                    updated_at = :now,
                    assigned_ambulance_id = NULL
                WHERE id = :eid
                  AND assigned_ambulance_id = :aid
                """
            ),
            {
                "now": stamp,
                "eid": row[
                    "emergency_id"
                ],
                "aid": row[
                    "ambulance_id"
                ],
            },
        )

    elif status == "completed":
        db.execute(
            text(
                """
                UPDATE emergencies
                SET
                    status = 'resolved',
                    updated_at = :now
                WHERE id = :eid
                """
            ),
            {
                "now": stamp,
                "eid": row[
                    "emergency_id"
                ],
            },
        )

    db.commit()

    return {
        "success": True,
        "assignment_id": row["id"],
        "emergency_id": row[
            "emergency_id"
        ],
        "ambulance_id": row[
            "ambulance_id"
        ],
        "status": status,
    }