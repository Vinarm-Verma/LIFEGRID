from fastapi import APIRouter

from app.schemas.ai import (
    EmergencyAnalysisRequest,
    EmergencyAnalysisResponse,
)
from app.services.ai_engine import analyze_emergency


router = APIRouter(
    prefix="/ai",
    tags=["AI Emergency Intelligence"],
)


@router.post(
    "/analyze-emergency",
    response_model=EmergencyAnalysisResponse,
)
async def analyze_emergency_endpoint(
    request: EmergencyAnalysisRequest,
):
    result = analyze_emergency(
        description=request.description,
        patient_count=request.patient_count,
    )

    return result