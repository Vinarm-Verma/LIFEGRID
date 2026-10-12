from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.database import Base


class Hospital(Base):
    __tablename__ = "hospitals"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    name: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
    )

    address: Mapped[str] = mapped_column(
        String(300),
        nullable=False,
    )

    city: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    state: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    latitude: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    longitude: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    emergency_capability: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )

    trauma_capability: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )

    icu_available: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )

    ventilators_available: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )

    emergency_beds_available: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    owner_auth_user_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    verification_status: Mapped[str] = mapped_column(String(30), nullable=False, default="verified")
    availability_status: Mapped[str] = mapped_column(String(30), nullable=False, default="open")
    emergency_accepting: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    icu_beds_available: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    capacity_source: Mapped[str | None] = mapped_column(String(50), nullable=True)
    capacity_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    capacity_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    capacity_stale_after_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    data_source: Mapped[str] = mapped_column(String(50), nullable=False, default="manual")
    source_record_id: Mapped[str | None] = mapped_column(String(150), nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    website: Mapped[str | None] = mapped_column(String(500), nullable=True)
    directory_emergency_tag: Mapped[str | None] = mapped_column(String(100), nullable=True)
    directory_last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_directory_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)