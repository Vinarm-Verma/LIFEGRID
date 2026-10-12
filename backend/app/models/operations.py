from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.database import Base


class EmergencyHospitalResponse(Base):
    __tablename__ = "emergency_hospital_responses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    emergency_id: Mapped[int] = mapped_column(ForeignKey("emergencies.id"), nullable=False, index=True, unique=True)
    hospital_id: Mapped[int | None] = mapped_column(ForeignKey("hospitals.id"), nullable=True)
    assigned_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="requested")
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    responded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class LocationUpdate(Base):
    __tablename__ = "location_updates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ambulance_id: Mapped[int] = mapped_column(ForeignKey("ambulances.id"), nullable=False, index=True)
    emergency_id: Mapped[int | None] = mapped_column(ForeignKey("emergencies.id"), nullable=True)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    accuracy_meters: Mapped[float | None] = mapped_column(Float, nullable=True)
    heading_degrees: Mapped[float | None] = mapped_column(Float, nullable=True)
    speed_mps: Mapped[float | None] = mapped_column(Float, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), index=True)


class DispatchAssignment(Base):
    __tablename__ = "lifegrid_dispatch_assignments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    emergency_id: Mapped[int] = mapped_column(ForeignKey("emergencies.id"), nullable=False, index=True)
    ambulance_id: Mapped[int] = mapped_column(ForeignKey("ambulances.id"), nullable=False, index=True)
    hospital_id: Mapped[int | None] = mapped_column(ForeignKey("hospitals.id"), nullable=True)
    assigned_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="assigned")
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    en_route_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    arrived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    transporting_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
