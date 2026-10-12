from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.database import Base


class Ambulance(Base):
    __tablename__ = "ambulances"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    vehicle_number: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        nullable=False,
        index=True,
    )

    provider_name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    ambulance_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="basic",
    )

    latitude: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    longitude: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="available",
    )

    oxygen_available: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )

    ventilator_available: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )

    paramedic_available: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )

    last_updated: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    owner_auth_user_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    verification_status: Mapped[str] = mapped_column(String(30), nullable=False, default="verified")
    gps_source: Mapped[str | None] = mapped_column(String(50), nullable=True)
    location_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    gps_accuracy_m: Mapped[float | None] = mapped_column(Float, nullable=True)