import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# Load the project .env without overriding environment variables supplied by
# the shell. This lets Windows/local deployments choose a writable data folder.
load_dotenv(
    dotenv_path=os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env")),
    override=False,
)

DATABASE_URL = (os.getenv("DATABASE_URL") or "").strip()
if not DATABASE_URL:
    DATABASE_URL = "sqlite:///./lifegrid.db"

IS_SQLITE = DATABASE_URL.startswith("sqlite")

if IS_SQLITE:
    # Resolve relative SQLite databases into a writable per-user folder.
    if DATABASE_URL.startswith("sqlite:///") and not DATABASE_URL.startswith("sqlite:////"):
        sqlite_target = DATABASE_URL[len("sqlite:///"):]
        if sqlite_target.startswith("./"):
            sqlite_target = sqlite_target[2:]

        data_dir = os.getenv("LIFEGRID_DATA_DIR")
        if data_dir:
            data_dir = os.path.expandvars(os.path.expanduser(data_dir))
        else:
            data_dir = os.path.join(os.path.expanduser("~"), "LifeGridData")

        os.makedirs(data_dir, exist_ok=True)
        database_path = os.path.abspath(os.path.join(data_dir, sqlite_target))
        os.makedirs(os.path.dirname(database_path), exist_ok=True)
        DATABASE_URL = "sqlite:///" + database_path.replace("\\", "/")

    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
    )
else:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_recycle=1800,
        pool_size=3,
        max_overflow=2,
        pool_timeout=5,
        connect_args={"connect_timeout": 8},
    )

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _sqlite_columns(connection, table: str) -> set[str]:
    return {row[1] for row in connection.exec_driver_sql(f'PRAGMA table_info("{table}")').fetchall()}


def _add_sqlite_column(connection, table: str, column: str, definition: str):
    columns = _sqlite_columns(connection, table)
    if column not in columns:
        connection.exec_driver_sql(
            f'ALTER TABLE "{table}" ADD COLUMN "{column}" {definition}'
        )
        print(f"[LIFEGRID] Added SQLite column: {table}.{column}")


def _migrate_sqlite(connection):
    # Existing projects may contain an older lifegrid.db. SQLAlchemy's
    # create_all() does not alter existing tables, so the compatibility
    # migration below upgrades them in-place without destroying data.
    columns = {
        "ambulances": {
            "owner_auth_user_id": "TEXT",
            "verification_status": "TEXT NOT NULL DEFAULT 'verified'",
            "gps_source": "TEXT NOT NULL DEFAULT 'legacy'",
            "location_updated_at": "DATETIME",
            "gps_accuracy_m": "REAL",
        },
        "hospitals": {
            "owner_auth_user_id": "TEXT",
            "phone": "TEXT",
            "website": "TEXT",
            "data_source": "TEXT NOT NULL DEFAULT 'manual'",
            "verification_status": "TEXT NOT NULL DEFAULT 'verified'",
            "availability_status": "TEXT NOT NULL DEFAULT 'open'",
            "emergency_accepting": "INTEGER NOT NULL DEFAULT 1",
            "icu_beds_available": "INTEGER NOT NULL DEFAULT 0",
            "capacity_source": "TEXT NOT NULL DEFAULT 'legacy_seed'",
            "capacity_updated_at": "DATETIME",
            "capacity_verified_at": "DATETIME",
            "capacity_stale_after_minutes": "INTEGER NOT NULL DEFAULT 30",
            "last_directory_sync_at": "DATETIME",
            "directory_last_seen_at": "DATETIME",
        },
        "resources": {
            "owner_auth_user_id": "TEXT",
            "is_active": "INTEGER NOT NULL DEFAULT 1",
        },
        "emergency_hospital_responses": {
            "message": "TEXT",
        },
    }

    for table, table_columns in columns.items():
        if table not in inspect(connection).get_table_names():
            continue
        for column, definition in table_columns.items():
            _add_sqlite_column(connection, table, column, definition)

    # Dispatch workflow tables.
    connection.exec_driver_sql("""
        CREATE TABLE IF NOT EXISTS lifegrid_dispatch_assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            emergency_id INTEGER NOT NULL,
            ambulance_id INTEGER NOT NULL,
            hospital_id INTEGER,
            assigned_by TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'assigned',
            assigned_at DATETIME NOT NULL,
            accepted_at DATETIME,
            rejected_at DATETIME,
            en_route_at DATETIME,
            arrived_at DATETIME,
            transporting_at DATETIME,
            completed_at DATETIME,
            cancelled_at DATETIME,
            rejection_reason TEXT,
            updated_at DATETIME NOT NULL
        )
    """)
    connection.exec_driver_sql("""
        CREATE INDEX IF NOT EXISTS idx_dispatch_emergency
        ON lifegrid_dispatch_assignments(emergency_id, status)
    """)
    connection.exec_driver_sql("""
        CREATE INDEX IF NOT EXISTS idx_dispatch_ambulance
        ON lifegrid_dispatch_assignments(ambulance_id, status)
    """)

    connection.exec_driver_sql("""
        CREATE TABLE IF NOT EXISTS emergency_hospital_responses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            emergency_id INTEGER NOT NULL UNIQUE,
            hospital_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'requested',
            message TEXT,
            responded_at DATETIME,
            updated_at DATETIME NOT NULL
        )
    """)

    connection.exec_driver_sql("""
        CREATE TABLE IF NOT EXISTS location_updates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ambulance_id INTEGER NOT NULL,
            emergency_id INTEGER,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            accuracy_meters REAL,
            heading_degrees REAL,
            speed_mps REAL,
            recorded_at DATETIME NOT NULL
        )
    """)
    connection.exec_driver_sql("""
        CREATE INDEX IF NOT EXISTS idx_location_updates_ambulance_time
        ON location_updates(ambulance_id, recorded_at DESC)
    """)

    connection.exec_driver_sql("""
        CREATE TABLE IF NOT EXISTS account_registrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            auth_user_id TEXT NOT NULL UNIQUE,
            requested_role TEXT NOT NULL,
            full_name TEXT,
            email TEXT,
            phone TEXT,
            organization_name TEXT,
            payload TEXT NOT NULL DEFAULT '{}',
            status TEXT NOT NULL DEFAULT 'pending',
            reviewed_by TEXT,
            reviewed_at DATETIME,
            rejection_reason TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)
    connection.exec_driver_sql("""
        CREATE INDEX IF NOT EXISTS idx_account_registrations_status
        ON account_registrations(status, created_at DESC)
    """)

    # Upgrade legacy seeded rows so the coordinator can inspect and test the
    # matching engine immediately after an upgrade. Real provider accounts can
    # overwrite these values during onboarding/approval.
    now = datetime.now(timezone.utc)
    connection.execute(text("""
        UPDATE hospitals
        SET verification_status = COALESCE(NULLIF(verification_status, ''), 'verified'),
            availability_status = COALESCE(NULLIF(availability_status, ''), 'open'),
            emergency_accepting = COALESCE(emergency_accepting, 1),
            capacity_source = COALESCE(NULLIF(capacity_source, ''), 'legacy_seed'),
            capacity_updated_at = COALESCE(capacity_updated_at, :now),
            capacity_verified_at = COALESCE(capacity_verified_at, :now),
            capacity_stale_after_minutes = COALESCE(capacity_stale_after_minutes, 30),
            icu_beds_available = COALESCE(icu_beds_available, icu_available, 0)
    """), {"now": now})

    if os.getenv("LIFEGRID_LOCAL_DEMO", "true").lower() in {"1", "true", "yes", "on"}:
        # Keep the bundled local demo providers dispatchable for development.
        # Production deployments can set LIFEGRID_LOCAL_DEMO=false and require
        # real provider onboarding + device GPS.
        connection.execute(text("""
            UPDATE ambulances
            SET verification_status='verified',
                gps_source='provider_device',
                location_updated_at=:now
            WHERE is_active = 1 AND vehicle_number LIKE 'LG-AMB-%'
        """), {"now": now})


def _migrate_postgres(connection):
    # Production/Supabase compatibility migration. All statements are
    # idempotent so the application can start against an already-upgraded DB.
    statements = [
        "ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS owner_auth_user_id uuid",
        "ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'verified'",
        "ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS gps_source text NOT NULL DEFAULT 'legacy'",
        "ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS location_updated_at timestamptz",
        "ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS gps_accuracy_m double precision",
        "ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS owner_auth_user_id uuid",
        "ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS phone text",
        "ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS website text",
        "ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS data_source text NOT NULL DEFAULT 'manual'",
        "ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'verified'",
        "ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS availability_status text NOT NULL DEFAULT 'open'",
        "ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS emergency_accepting boolean NOT NULL DEFAULT true",
        "ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS icu_beds_available integer NOT NULL DEFAULT 0",
        "ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS capacity_source text NOT NULL DEFAULT 'manual'",
        "ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS capacity_updated_at timestamptz",
        "ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS capacity_verified_at timestamptz",
        "ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS capacity_stale_after_minutes integer NOT NULL DEFAULT 30",
        "ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS last_directory_sync_at timestamptz",
        "ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS directory_last_seen_at timestamptz",
        "ALTER TABLE resources ADD COLUMN IF NOT EXISTS owner_auth_user_id uuid",
        "ALTER TABLE resources ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true",
        "ALTER TABLE emergency_hospital_responses ADD COLUMN IF NOT EXISTS message text",
        """
        CREATE TABLE IF NOT EXISTS lifegrid_dispatch_assignments (
            id bigint generated by default as identity primary key,
            emergency_id bigint not null,
            ambulance_id bigint not null,
            hospital_id bigint,
            assigned_by uuid not null,
            status text not null default 'assigned',
            assigned_at timestamptz not null,
            accepted_at timestamptz,
            rejected_at timestamptz,
            en_route_at timestamptz,
            arrived_at timestamptz,
            transporting_at timestamptz,
            completed_at timestamptz,
            cancelled_at timestamptz,
            rejection_reason text,
            updated_at timestamptz not null
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_dispatch_emergency ON lifegrid_dispatch_assignments(emergency_id, status)",
        "CREATE INDEX IF NOT EXISTS idx_dispatch_ambulance ON lifegrid_dispatch_assignments(ambulance_id, status)",
        """
        CREATE TABLE IF NOT EXISTS emergency_hospital_responses (
            id bigint generated by default as identity primary key,
            emergency_id bigint not null unique,
            hospital_id bigint not null,
            status text not null default 'requested',
            message text,
            responded_at timestamptz,
            updated_at timestamptz not null
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS location_updates (
            id bigint generated by default as identity primary key,
            ambulance_id bigint not null,
            emergency_id bigint,
            latitude double precision not null,
            longitude double precision not null,
            accuracy_meters double precision,
            heading_degrees double precision,
            speed_mps double precision,
            recorded_at timestamptz not null
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_location_updates_ambulance_time ON location_updates(ambulance_id, recorded_at desc)",
        """
        CREATE TABLE IF NOT EXISTS account_registrations (
            id bigint generated by default as identity primary key,
            auth_user_id uuid not null unique,
            requested_role text not null,
            full_name text,
            email text,
            phone text,
            organization_name text,
            payload jsonb not null default '{}'::jsonb,
            status text not null default 'pending',
            reviewed_by uuid,
            reviewed_at timestamptz,
            rejection_reason text,
            created_at timestamptz not null default now(),
            updated_at timestamptz not null default now()
        )
        """,
    ]
    for statement in statements:
        connection.execute(text(statement))


def create_tables():
    # Import models before create_all so SQLAlchemy knows every table.
    from app.models.ambulance import Ambulance  # noqa: F401
    from app.models.emergency import Emergency  # noqa: F401
    from app.models.hospital import Hospital  # noqa: F401
    from app.models.resource import Resource  # noqa: F401
    from app.models.user import User  # noqa: F401

    Base.metadata.create_all(bind=engine)

    with engine.begin() as connection:
        if IS_SQLITE:
            _migrate_sqlite(connection)
        else:
            _migrate_postgres(connection)
