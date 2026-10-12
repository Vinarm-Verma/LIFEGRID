from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database.database import get_db
from app.models.emergency import Emergency
from app.models.hospital import Hospital


router = APIRouter()


def utc_now():
    return datetime.now(timezone.utc)


class HospitalResponseRequest(BaseModel):
    hospital_id: int | None = None
    status: str
    note: str | None = None


VALID_STATUSES = {
    "requested",
    "accepted",
    "rejected",
}


STATUS_ALIASES = {
    "accept": "accepted",
    "approve": "accepted",
    "approved": "accepted",
    "decline": "rejected",
    "declined": "rejected",
    "reject": "rejected",
    "pending": "requested",
    "request": "requested",
}


def normalize_status(status: str):
    normalized = status.strip().lower()

    normalized = STATUS_ALIASES.get(
        normalized,
        normalized,
    )

    if normalized not in VALID_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid hospital response status. "
                "Use requested, accepted, or rejected."
            ),
        )

    return normalized


def hospital_dict(hospital):
    return {
        "id": hospital.id,
        "name": hospital.name,
        "address": hospital.address,
        "city": hospital.city,
        "state": hospital.state,
        "latitude": hospital.latitude,
        "longitude": hospital.longitude,
        "emergency_capability": hospital.emergency_capability,
        "trauma_capability": hospital.trauma_capability,
        "icu_available": hospital.icu_available,
        "ventilators_available": hospital.ventilators_available,
        "emergency_beds_available": hospital.emergency_beds_available,
    }


def ambulance_dict(ambulance, ranked):
    return {
        "id": ambulance.id,
        "vehicle_number": ambulance.vehicle_number,
        "provider_name": ambulance.provider_name,
        "ambulance_type": ambulance.ambulance_type,
        "status": ambulance.status,
        "latitude": ambulance.latitude,
        "longitude": ambulance.longitude,
        "oxygen_available": ambulance.oxygen_available,
        "ventilator_available": ambulance.ventilator_available,
        "paramedic_available": ambulance.paramedic_available,
        "distance_km": ranked.get("distance_km"),
        "estimated_eta_minutes": ranked.get(
            "estimated_eta_minutes"
        ),
        "matching_score": ranked.get(
            "matching_score"
        ),
    }


# =========================================================
# GET HOSPITAL RESPONSE
# =========================================================

@router.get(
    "/api/emergencies/{emergency_id}/hospital-response"
)
def get_hospital_response(
    emergency_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    row = db.execute(
        text(
            """
            SELECT
                id,
                emergency_id,
                hospital_id,
                status,
                responded_at,
                updated_at
            FROM emergency_hospital_responses
            WHERE emergency_id = :emergency_id
            LIMIT 1
            """
        ),
        {
            "emergency_id": emergency_id,
        },
    ).mappings().first()

    if not row:
        return {
            "emergency_id": emergency_id,
            "hospital_id": None,
            "status": None,
            "responded_at": None,
            "updated_at": None,
        }

    return {
        "id": row["id"],
        "emergency_id": row["emergency_id"],
        "hospital_id": row["hospital_id"],
        "status": row["status"],
        "responded_at": row["responded_at"],
        "updated_at": row["updated_at"],
    }


# =========================================================
# SAVE HOSPITAL RESPONSE
# =========================================================

@router.post(
    "/api/emergencies/{emergency_id}/hospital-response"
)
def save_hospital_response(
    emergency_id: int,
    payload: HospitalResponseRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    role = str(
        user.get("role") or ""
    ).lower()

    if role not in {
        "hospital",
        "coordinator",
        "admin",
    }:
        raise HTTPException(
            status_code=403,
            detail="Hospital access required.",
        )

    status = normalize_status(
        payload.status
    )

    emergency = (
        db.query(Emergency)
        .filter(
            Emergency.id == emergency_id
        )
        .first()
    )

    if not emergency:
        raise HTTPException(
            status_code=404,
            detail=f"Emergency {emergency_id} not found.",
        )

    # -----------------------------------------------------
    # RESOLVE HOSPITAL
    # -----------------------------------------------------

    hospital = None

    if role == "hospital":
        hospital = (
            db.query(Hospital)
            .filter(
                Hospital.owner_auth_user_id
                == str(user["id"])
            )
            .first()
        )

        if not hospital:
            raise HTTPException(
                status_code=404,
                detail="Hospital profile not found.",
            )

        # Hospital users can ONLY respond for their own facility.
        if (
            payload.hospital_id is not None
            and int(payload.hospital_id)
            != int(hospital.id)
        ):
            raise HTTPException(
                status_code=403,
                detail=(
                    "A hospital can only respond "
                    "for its own facility."
                ),
            )

        hospital_id = hospital.id

    else:
        if payload.hospital_id is None:
            hospital_id = (
                emergency.selected_hospital_id
            )
        else:
            hospital_id = payload.hospital_id

        if hospital_id is None:
            raise HTTPException(
                status_code=400,
                detail="hospital_id is required.",
            )

        hospital = (
            db.query(Hospital)
            .filter(
                Hospital.id == hospital_id
            )
            .first()
        )

        if not hospital:
            raise HTTPException(
                status_code=404,
                detail="Hospital not found.",
            )

    # -----------------------------------------------------
    # VERIFY REQUESTED HOSPITAL
    # -----------------------------------------------------

    if (
        emergency.selected_hospital_id
        and int(emergency.selected_hospital_id)
        != int(hospital.id)
    ):
        raise HTTPException(
            status_code=403,
            detail=(
                "This emergency was routed to a different "
                "hospital."
            ),
        )

    # -----------------------------------------------------
    # REJECT
    # -----------------------------------------------------

    if status == "rejected":

        emergency.status = (
            "hospital_rejected"
        )
        emergency.updated_at = utc_now()

        db.execute(
            text(
                """
                INSERT INTO emergency_hospital_responses (
                    emergency_id,
                    hospital_id,
                    status,
                    responded_at,
                    updated_at
                )
                VALUES (
                    :emergency_id,
                    :hospital_id,
                    'rejected',
                    :responded_at,
                    :updated_at
                )
                ON CONFLICT (emergency_id)
                DO UPDATE SET
                    hospital_id = EXCLUDED.hospital_id,
                    status = 'rejected',
                    responded_at = EXCLUDED.responded_at,
                    updated_at = EXCLUDED.updated_at
                """
            ),
            {
                "emergency_id": emergency_id,
                "hospital_id": hospital.id,
                "responded_at": utc_now(),
                "updated_at": utc_now(),
            },
        )

        db.commit()

        return {
            "success": True,
            "emergency_id": emergency_id,
            "hospital_id": hospital.id,
            "status": "rejected",
            "emergency_status": emergency.status,
            "message": (
                "Hospital declined the emergency."
            ),
        }

    # -----------------------------------------------------
    # REQUESTED
    # -----------------------------------------------------

    if status == "requested":

        emergency.status = (
            "hospital_requested"
        )
        emergency.selected_hospital_id = (
            hospital.id
        )
        emergency.updated_at = utc_now()

        db.execute(
            text(
                """
                INSERT INTO emergency_hospital_responses (
                    emergency_id,
                    hospital_id,
                    status,
                    updated_at
                )
                VALUES (
                    :emergency_id,
                    :hospital_id,
                    'requested',
                    :updated_at
                )
                ON CONFLICT (emergency_id)
                DO UPDATE SET
                    hospital_id = EXCLUDED.hospital_id,
                    status = 'requested',
                    updated_at = EXCLUDED.updated_at
                """
            ),
            {
                "emergency_id": emergency_id,
                "hospital_id": hospital.id,
                "updated_at": utc_now(),
            },
        )

        db.commit()

        return {
            "success": True,
            "emergency_id": emergency_id,
            "hospital_id": hospital.id,
            "status": "requested",
            "emergency_status": emergency.status,
            "message": (
                "Hospital request is active."
            ),
        }

    # =====================================================
    # ACCEPT
    # =====================================================
    # Persist the hospital decision only. Ambulance assignment is handled
    # by POST /api/matching/emergency/{id}/coordinate so that a single
    # dispatch workflow creates the lifegrid_dispatch_assignments record
    # consumed by the ambulance driver's dashboard.

    emergency.selected_hospital_id = hospital.id
    emergency.status = "hospital_accepted"
    now = utc_now()

    db.execute(
        text(
            """
            INSERT INTO emergency_hospital_responses (
                emergency_id,
                hospital_id,
                status,
                responded_at,
                updated_at
            )
            VALUES (
                :emergency_id,
                :hospital_id,
                'accepted',
                :responded_at,
                :updated_at
            )
            ON CONFLICT (emergency_id)
            DO UPDATE SET
                hospital_id = EXCLUDED.hospital_id,
                status = 'accepted',
                responded_at = EXCLUDED.responded_at,
                updated_at = EXCLUDED.updated_at
            """
        ),
        {
            "emergency_id": emergency_id,
            "hospital_id": hospital.id,
            "responded_at": now,
            "updated_at": now,
        },
    )

    db.commit()

    return {
        "success": True,
        "emergency_id": emergency_id,
        "hospital_id": hospital.id,
        "status": "accepted",
        "emergency_status": emergency.status,
        "ambulance": None,
        "hospital": hospital_dict(hospital),
        "message": "Hospital acceptance recorded. Ambulance coordination can now proceed.",
    }
