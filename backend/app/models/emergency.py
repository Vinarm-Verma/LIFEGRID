from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.database import Base


class Emergency(Base):
    __tablename__ = "emergencies"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    emergency_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    description: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    patient_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
    )

    severity: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="unknown",
    )

    severity_score: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )

    latitude: Mapped[float] = mapped_column(
        Float,
        nullable=True,
    )

    longitude: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    location_description: Mapped[str | None] = mapped_column(
        String(300),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="reported",
    )

    ai_summary: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    required_resources: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    assigned_ambulance_id: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    selected_hospital_id: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )