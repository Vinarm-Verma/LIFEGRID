import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database.database import get_db
from app.models.emergency import Emergency
from app.models.hospital import Hospital
from app.services.ai_engine import analyze_emergency
from app.api.routes import matching as matching_service


router = APIRouter(
    prefix="/emergencies",
    tags=["Emergencies"],
)


# =========================================================
# HELPERS
# =========================================================

def parse_required_resources(value):
    if isinstance(value, list):
        return value

    if isinstance(value, tuple):
        return list(value)

    if isinstance(value, str):
        try:
            parsed = json.loads(value or "[]")
            return parsed if isinstance(parsed, list) else []
        except (json.JSONDecodeError, TypeError):
            return []

    return []


def emergency_to_dict(emergency):
    return {
        "id": emergency.id,
        "emergency_id": emergency.id,
        "emergency_type": emergency.emergency_type,
        "description": emergency.description,
        "patient_count": emergency.patient_count,
        "severity": emergency.severity,
        "severity_score": emergency.severity_score,
        "latitude": emergency.latitude,
        "longitude": emergency.longitude,
        "location_description": emergency.location_description,
        "status": emergency.status,
        "ai_summary": emergency.ai_summary,
        "required_resources": parse_required_resources(
            emergency.required_resources
        ),
        "assigned_ambulance_id": emergency.assigned_ambulance_id,
        "selected_hospital_id": emergency.selected_hospital_id,
        "created_at": emergency.created_at,
        "updated_at": emergency.updated_at,
    }


def create_hospital_request(
    db: Session,
    emergency: Emergency,
):
    """
    LIFEGRID's first operational routing step.

    Citizen report
        ↓
    Find suitable nearby hospital
        ↓
    Create hospital REQUESTED state

    Ambulance is intentionally NOT assigned here.
    Ambulance assignment happens only after the hospital accepts.
    """

    if emergency.latitude is None or emergency.longitude is None:
        emergency.status = "hospital_matching_pending"
        return None

    hospitals = matching_service.rank_hospitals(
        db,
        emergency,
    )

    if not hospitals:
        emergency.status = "hospital_matching_failed"
        return None

    selected = hospitals[0]

    hospital = (
        db.query(Hospital)
        .filter(Hospital.id == selected["id"])
        .first()
    )

    if not hospital:
        emergency.status = "hospital_matching_failed"
        return None

    emergency.selected_hospital_id = hospital.id
    emergency.status = "hospital_requested"

    now = datetime.now(timezone.utc)

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
                'requested',
                NULL,
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
            "emergency_id": emergency.id,
            "hospital_id": hospital.id,
            "updated_at": now,
        },
    )

    return {
        "hospital": {
            "id": hospital.id,
            "name": hospital.name,
            "address": hospital.address,
            "city": hospital.city,
            "state": hospital.state,
            "latitude": hospital.latitude,
            "longitude": hospital.longitude,
            "distance_km": selected["distance_km"],
            "estimated_eta_minutes": selected[
                "estimated_eta_minutes"
            ],
            "matching_score": selected["matching_score"],
        },
        "ranked_hospitals": hospitals,
    }


# =========================================================
# REQUEST MODELS
# =========================================================

class EmergencyCreateRequest(BaseModel):
    emergency_type: str
    description: str
    patient_count: int = 1
    latitude: float | None = None
    longitude: float | None = None
    location_description: str | None = None


class IntelligentEmergencyRequest(BaseModel):
    description: str
    patient_count: int = 1
    latitude: float | None = None
    longitude: float | None = None
    location_description: str | None = None
    emergency_type: str | None = None


# =========================================================
# NORMAL EMERGENCY CREATION
# =========================================================

@router.post("")
def create_emergency(
    payload: EmergencyCreateRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    if payload.patient_count < 1:
        raise HTTPException(
            status_code=400,
            detail="patient_count must be at least 1.",
        )

    now = datetime.now(timezone.utc)

    emergency = Emergency(
        emergency_type=payload.emergency_type,
        description=payload.description,
        patient_count=payload.patient_count,
        latitude=payload.latitude,
        longitude=payload.longitude,
        location_description=payload.location_description,
        severity="pending",
        severity_score=0,
        status="reported",
        ai_summary=None,
        required_resources=json.dumps([]),
        created_at=now,
        updated_at=now,
    )

    db.add(emergency)
    db.flush()

    hospital_match = create_hospital_request(
        db,
        emergency,
    )

    emergency.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(emergency)

    return {
        "success": True,
        "id": emergency.id,
        "emergency_id": emergency.id,
        "status": emergency.status,
        "selected_hospital": (
            hospital_match["hospital"]
            if hospital_match
            else None
        ),
        "message": (
            "Emergency reported and hospital request created."
            if hospital_match
            else (
                "Emergency reported. "
                "Hospital matching is waiting for a valid GPS location."
            )
        ),
    }


# =========================================================
# INTELLIGENT EMERGENCY CREATION
# =========================================================

@router.post("/intelligent")
def create_intelligent_emergency(
    payload: IntelligentEmergencyRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    LIFEGRID emergency intelligence flow.

    IMPORTANT:
    This endpoint intentionally DOES NOT assign an ambulance.

    Correct workflow:

        Citizen
           ↓
        AI analysis
           ↓
        Nearby hospital selected
           ↓
        Hospital request created
           ↓
        Hospital accepts
           ↓
        Ambulance assigned
    """

    if payload.patient_count < 1:
        raise HTTPException(
            status_code=400,
            detail="patient_count must be at least 1.",
        )

    if not payload.description.strip():
        raise HTTPException(
            status_code=400,
            detail="Emergency description is required.",
        )

    try:
        analysis = analyze_emergency(
            description=payload.description,
            patient_count=payload.patient_count,
            emergency_type=payload.emergency_type,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"AI analysis failed: {str(exc)}",
        ) from exc

    now = datetime.now(timezone.utc)

    emergency = Emergency(
        emergency_type=analysis["emergency_type"],
        description=payload.description,
        patient_count=analysis["patient_count"],
        severity=analysis["severity"],
        severity_score=analysis["severity_score"],
        latitude=payload.latitude,
        longitude=payload.longitude,
        location_description=payload.location_description,
        status="ai_analyzed",
        ai_summary=analysis["ai_summary"],
        required_resources=json.dumps(
            analysis["required_resources"]
        ),
        created_at=now,
        updated_at=now,
    )

    db.add(emergency)
    db.flush()

    hospital_match = create_hospital_request(
        db,
        emergency,
    )

    emergency.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(emergency)

    return {
        "success": True,
        "id": emergency.id,
        "emergency_id": emergency.id,

        "emergency": emergency_to_dict(
            emergency
        ),

        "analysis": analysis,

        "hospital_routing": (
            hospital_match
            if hospital_match
            else {
                "status": "pending",
                "message": (
                    "Hospital matching requires a valid "
                    "emergency GPS location."
                ),
            }
        ),

        "message": (
            "Emergency analysed and routed to a hospital "
            "for acceptance."
        ),

        "decision_support_notice": (
            "LIFEGRID provides emergency decision support. "
            "It does not replace medical professionals, "
            "ambulance dispatch systems, or emergency services."
        ),
    }


# =========================================================
# HOSPITAL INCOMING QUEUE
# =========================================================

@router.get("/hospital/incoming")
def get_hospital_incoming_emergencies(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Return only emergencies assigned to the authenticated hospital.

    This prevents one hospital from seeing another hospital's
    emergency queue.
    """

    if user.get("role") != "hospital":
        raise HTTPException(
            status_code=403,
            detail="Hospital access required.",
        )

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

    rows = db.execute(
        text(
            """
            SELECT emergency_id, status
            FROM emergency_hospital_responses
            WHERE hospital_id = :hospital_id
              AND status IN ('requested', 'accepted')
            ORDER BY updated_at DESC NULLS LAST
            """
        ),
        {
            "hospital_id": hospital.id,
        },
    ).mappings().all()

    emergency_ids = [
        int(row["emergency_id"])
        for row in rows
    ]

    if not emergency_ids:
        return {
            "success": True,
            "hospital_id": hospital.id,
            "count": 0,
            "emergencies": [],
        }

    emergencies = (
        db.query(Emergency)
        .filter(
            Emergency.id.in_(emergency_ids)
        )
        .order_by(
            Emergency.created_at.desc()
        )
        .all()
    )

    response_status = {
        int(row["emergency_id"]): row["status"]
        for row in rows
    }

    results = []

    for emergency in emergencies:
        item = emergency_to_dict(emergency)
        item["hospital_response_status"] = (
            response_status.get(
                emergency.id
            )
        )
        results.append(item)

    return {
        "success": True,
        "hospital_id": hospital.id,
        "hospital": {
            "id": hospital.id,
            "name": hospital.name,
            "address": hospital.address,
            "city": hospital.city,
            "state": hospital.state,
        },
        "count": len(results),
        "emergencies": results,
    }


# =========================================================
# ALL AUTHENTICATED EMERGENCIES
# =========================================================

@router.get("")
def get_emergencies(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    emergencies = (
        db.query(Emergency)
        .order_by(
            Emergency.created_at.desc()
        )
        .all()
    )

    results = [
        emergency_to_dict(emergency)
        for emergency in emergencies
    ]

    return {
        "success": True,
        "count": len(results),
        "emergencies": results,
    }


# =========================================================
# SINGLE EMERGENCY
# =========================================================

@router.get("/{emergency_id}")
def get_emergency(
    emergency_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
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
            detail="Emergency not found.",
        )

    return {
        "success": True,
        **emergency_to_dict(emergency),
    }