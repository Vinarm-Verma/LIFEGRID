from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.models.ambulance import Ambulance
from app.models.emergency import Emergency
from app.models.hospital import Hospital
from app.models.resource import Resource
from app.auth import get_current_user
from app.api.routes.matching import rank_ambulances, rank_hospitals
from app.auth import _decode_token
from app.realtime import realtime_manager


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


def find_resources(db: Session, emergency: Emergency):
    """Return verified resources that can satisfy the analysed emergency."""
    rows = (
        db.query(Resource)
        .filter(
            Resource.is_active.is_(True),
            Resource.verified.is_(True),
            Resource.status == "available",
            Resource.quantity_available > 0,
        )
        .order_by(Resource.id)
        .all()
    )

    raw_required = emergency.required_resources or []
    if isinstance(raw_required, str):
        try:
            raw_required = json.loads(raw_required or "[]")
        except (TypeError, ValueError, json.JSONDecodeError):
            raw_required = []
    if not isinstance(raw_required, (list, tuple, set)):
        raw_required = []

    required = {
        str(item).strip().lower()
        for item in raw_required
        if str(item).strip()
    }

    result = []
    for item in rows:
        item_type = str(item.resource_type or "").lower()
        item_name = str(item.resource_name or "").lower()
        if required and not any(
            req in item_type or req in item_name or item_type in req
            for req in required
        ):
            continue
        result.append(model_to_dict(item))
    return result




@router.websocket("/ws/{emergency_id}")
async def realtime_websocket(websocket: WebSocket, emergency_id: int):
    """Authenticated live event channel for one emergency."""
    await websocket.accept()

    try:
        raw = await websocket.receive_json()
        token = str(raw.get("token") or "").strip()

        if raw.get("type") != "auth" or not token:
            await websocket.close(code=1008, reason="Authentication required")
            return

        try:
            claims = _decode_token(token)
        except Exception:
            await websocket.close(code=1008, reason="Invalid authentication token")
            return

        if not claims.get("sub"):
            await websocket.close(code=1008, reason="Invalid user identity")
            return

        # The authoritative snapshot endpoint performs the existence check.
        # The socket itself only transports lightweight change notifications.

        await realtime_manager.register(emergency_id, websocket)

        await websocket.send_json({
            "type": "ready",
            "emergency_id": emergency_id,
        })

        while True:
            message = await websocket.receive_json()
            if message.get("type") == "ping":
                await websocket.send_json({
                    "type": "pong",
                    "emergency_id": emergency_id,
                })

    except WebSocketDisconnect:
        await realtime_manager.disconnect(emergency_id, websocket)
    except Exception:
        await realtime_manager.disconnect(emergency_id, websocket)
        try:
            await websocket.close(code=1011)
        except Exception:
            pass


@router.get("/emergency/{emergency_id}")
def get_realtime_emergency(
    emergency_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
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
