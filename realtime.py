from __future__ import annotations

from datetime import datetime, timezone
import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.models.ambulance import Ambulance
from app.models.emergency import Emergency
from app.models.hospital import Hospital
from app.models.resource import Resource
from app.services.ai_engine import analyze_emergency
from app.api.routes.matching import rank_ambulances, rank_hospitals


router = APIRouter(prefix="/realtime", tags=["Realtime"])


def model_to_dict(obj):
    if obj is None:
        return None

    data = {}
    for column in obj.__table__.columns:
        value = getattr(obj, column.name)
        if isinstance(value, datetime):
            value = value.isoformat()
        data[column.name] = value
    return data


class FastEmergencyRequest(BaseModel):
    description: str
    patient_count: int = 1
    latitude: float | None = None
    longitude: float | None = None
    location_description: str | None = None


@router.post("/emergency/intelligent-coordinate")
def create_and_coordinate_emergency(
    payload: FastEmergencyRequest,
    db: Session = Depends(get_db),
):
    """
    LIFEGRID fast demo path.

    Combines AI analysis, emergency creation, demo ambulance recovery,
    ambulance ranking, hospital ranking and assignment into one HTTP request.
    """
    try:
        analysis = analyze_emergency(
            description=payload.description,
            patient_count=payload.patient_count,
        )

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

        ambulances = rank_ambulances(db, emergency)
        if not ambulances:
            db.rollback()
            raise HTTPException(
                status_code=409,
                detail="No available ambulance found. Please check the demo ambulance data.",
            )

        hospitals = rank_hospitals(db, emergency)
        if not hospitals:
            db.rollback()
            raise HTTPException(
                status_code=409,
                detail="No suitable hospital found for this emergency.",
            )

        selected_ambulance = ambulances[0]
        selected_hospital = hospitals[0]

        ambulance = (
            db.query(Ambulance)
            .filter(Ambulance.id == selected_ambulance["id"])
            .first()
        )
        hospital = (
            db.query(Hospital)
            .filter(Hospital.id == selected_hospital["id"])
            .first()
        )

        if not ambulance or not hospital:
            db.rollback()
            raise HTTPException(
                status_code=409,
                detail="The selected response resources are no longer available.",
            )

        ambulance.status = "assigned"
        ambulance.last_updated = now
        emergency.assigned_ambulance_id = ambulance.id
        emergency.selected_hospital_id = hospital.id
        emergency.status = "coordinated"
        emergency.updated_at = now

        resources = [
            model_to_dict(item)
            for item in db.query(Resource).filter(
                Resource.is_active.is_(True),
                Resource.verified.is_(True),
                Resource.status == "available",
                Resource.quantity_available > 0,
            ).all()
        ]

        db.commit()

        ambulance_data = {
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
            "distance_km": selected_ambulance["distance_km"],
            "estimated_eta_minutes": max(1, round(selected_ambulance["distance_km"] * 2.5)) ,
            "matching_score": selected_ambulance["matching_score"],
        }

        hospital_data = {
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
            "distance_km": selected_hospital["distance_km"],
            "estimated_eta_minutes": max(1, round(selected_hospital["distance_km"] * 2.5)) ,
            "matching_score": selected_hospital["matching_score"],
        }

        emergency_data = model_to_dict(emergency)

        coordination = {
            "success": True,
            "status": "coordinated",
            "emergency_id": emergency.id,
            "emergency_status": emergency.status,
            "recommended_ambulance": ambulance_data,
            "recommended_hospital": hospital_data,
            "resources": resources,
            "ranked_ambulances": ambulances,
            "ranked_hospitals": hospitals,
            "message": "Emergency response successfully coordinated.",
        }

        return {
            "success": True,
            "id": emergency.id,
            "emergency_id": emergency.id,
            "emergency": emergency_data,
            "analysis": analysis,
            "coordination": coordination,
            "status": "coordinated",
            "message": "Emergency analyzed and coordinated successfully.",
        }

    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Fast emergency coordination failed: {str(exc)}",
        )


@router.get("/emergency/{emergency_id}")
def get_realtime_emergency(
    emergency_id: int,
    db: Session = Depends(get_db),
):
    """
    Return the complete LIFEGRID live snapshot in one database/API request.

    This endpoint intentionally uses the existing production tables and does
    not create or alter schema objects at request time.
    """
    emergency = (
        db.query(Emergency)
        .filter(Emergency.id == emergency_id)
        .first()
    )

    if emergency is None:
        raise HTTPException(status_code=404, detail="Emergency not found")

    ambulance = None
    if emergency.assigned_ambulance_id is not None:
        ambulance = (
            db.query(Ambulance)
            .filter(Ambulance.id == emergency.assigned_ambulance_id)
            .first()
        )

    hospital = None
    if emergency.selected_hospital_id is not None:
        hospital = (
            db.query(Hospital)
            .filter(Hospital.id == emergency.selected_hospital_id)
            .first()
        )

    resources = (
        db.query(Resource)
        .filter(
            Resource.is_active.is_(True),
            Resource.verified.is_(True),
            Resource.status == "available",
            Resource.quantity_available > 0,
        )
        .all()
    )

    hospital_response = db.execute(
        text(
            """
            SELECT
                id,
                emergency_id,
                hospital_id,
                status,
                message,
                responded_at
            FROM emergency_hospital_responses
            WHERE emergency_id = :emergency_id
            LIMIT 1
            """
        ),
        {"emergency_id": emergency_id},
    ).mappings().first()

    if hospital_response:
        hospital_response = dict(hospital_response)
        for key, value in list(hospital_response.items()):
            if isinstance(value, datetime):
                hospital_response[key] = value.isoformat()

    received_at = datetime.now(timezone.utc).isoformat()

    return {
        "emergency": model_to_dict(emergency),
        "ambulance": model_to_dict(ambulance),
        "hospital": model_to_dict(hospital),
        "resources": [model_to_dict(item) for item in resources],
        "hospitalResponse": hospital_response,
        "receivedAt": received_at,
    }
