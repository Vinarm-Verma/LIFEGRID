from pydantic import BaseModel, Field


class EmergencyAnalysisRequest(BaseModel):
    description: str = Field(
        ...,
        min_length=3,
        max_length=5000,
        description="Emergency description provided by the citizen or responder.",
    )

    patient_count: int = Field(
        default=1,
        ge=1,
        description="Number of people involved.",
    )


class EmergencyAnalysisResponse(BaseModel):
    emergency_type: str
    patient_count: int

    conditions: list[str]

    severity: str
    severity_score: int

    required_resources: list[str]

    ai_summary: str
