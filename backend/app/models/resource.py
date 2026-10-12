from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.database import Base


class Resource(Base):
    __tablename__ = "resources"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    provider_name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    resource_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    resource_name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    quantity_available: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
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

    verified: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )

    last_verified: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    owner_auth_user_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)