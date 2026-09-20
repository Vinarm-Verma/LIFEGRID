import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database.database import get_db
from app.models.emergency import Emergency
from app.services.ai_engine import analyze_emergency


router = APIRouter(
    prefix="/emergencies",
    tags=["Emergencies"],
)


def parse_required_resources(value):
    """
    Normalize required_resources regardless of how SQLAlchemy/Postgres
    returns the value.

    Some existing LIFEGRID records contain a JSON string while newer
    records may already be returned as a Python list.
    """
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


@router.post("")
def create_emergency(
    payload: EmergencyCreateRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
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
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    db.add(emergency)
    db.commit()
    db.refresh(emergency)

    return {
        "success": True,
        "id": emergency.id,
        "emergency_id": emergency.id,
        "status": emergency.status,
        "message": "Emergency reported successfully.",
    }


@router.post("/intelligent")
def create_intelligent_emergency(
    payload: IntelligentEmergencyRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Create an emergency and run LIFEGRID's deterministic
    decision-support analysis.
    """

    if payload.patient_count < 1:
        raise HTTPException(
            status_code=400,
            detail="patient_count must be at least 1.",
        )

    try:
        analysis = analyze_emergency(
            description=payload.description,
            patient_count=payload.patient_count,
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
    db.commit()
    db.refresh(emergency)

    emergency_id = emergency.id

    return {
        "success": True,
        "id": emergency_id,
        "emergency_id": emergency_id,
        "emergency": {
            **emergency_to_dict(emergency),
        },
        "analysis": analysis,
        "message": "Emergency analysed successfully.",
        "decision_support_notice": (
            "LIFEGRID provides emergency decision support. "
            "It does not replace medical professionals, "
            "ambulance dispatch systems, or emergency services."
        ),
    }


@router.get("")
def get_emergencies(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Coordinator/provider emergency queue.

    IMPORTANT:
    Do not call json.loads() directly on required_resources here.
    Existing PostgreSQL records can already deserialize it to a list.
    """

    emergencies = (
        db.query(Emergency)
        .order_by(Emergency.created_at.desc())
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


@router.get("/{emergency_id}")
def get_emergency(
    emergency_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    emergency = (
        db.query(Emergency)
        .filter(Emergency.id == emergency_id)
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
