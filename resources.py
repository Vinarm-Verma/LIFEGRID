from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database.database import get_db
from app.models.resource import Resource


router = APIRouter(
    prefix="/resources",
    tags=["Resources"],
)


@router.get("")
def get_resources(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Return currently available resources to authenticated LIFEGRID users."""
    resources = db.scalars(
        select(Resource)
        .where(Resource.status == "available")
        .order_by(Resource.id)
    ).all()

    return [
        {
            "id": resource.id,
            "provider_name": resource.provider_name,
            "resource_type": resource.resource_type,
            "resource_name": resource.resource_name,
            "quantity_available": resource.quantity_available,
            "latitude": resource.latitude,
            "longitude": resource.longitude,
            "status": resource.status,
            "verified": resource.verified,
            "last_verified": (
                resource.last_verified.isoformat()
                if resource.last_verified
                else None
            ),
        }
        for resource in resources
    ]
