from datetime import datetime, timezone

from sqlalchemy import func, select

from app.database.database import SessionLocal
from app.models.ambulance import Ambulance
from app.models.hospital import Hospital
from app.models.resource import Resource


def seed_demo_data():
    db = SessionLocal()

    try:
        hospital_count = db.scalar(
            select(func.count()).select_from(Hospital)
        )

        if hospital_count and hospital_count > 0:
            print("LIFEGRID demo data already exists.")
            return

        hospitals = [
            Hospital(
                name="LIFEGRID City Trauma Center",
                address="Agra Road",
                city="Hathras",
                state="Uttar Pradesh",
                latitude=27.5950,
                longitude=78.0500,
                emergency_capability=True,
                trauma_capability=True,
                icu_available=8,
                ventilators_available=4,
                emergency_beds_available=15,
            ),
            Hospital(
                name="LIFEGRID District Emergency Hospital",
                address="District Hospital Road",
                city="Hathras",
                state="Uttar Pradesh",
                latitude=27.6050,
                longitude=78.0600,
                emergency_capability=True,
                trauma_capability=True,
                icu_available=5,
                ventilators_available=2,
                emergency_beds_available=12,
            ),
            Hospital(
                name="LIFEGRID Advanced Medical Center",
                address="Mathura Road",
                city="Aligarh",
                state="Uttar Pradesh",
                latitude=27.8974,
                longitude=78.0880,
                emergency_capability=True,
                trauma_capability=True,
                icu_available=12,
                ventilators_available=6,
                emergency_beds_available=20,
            ),
        ]

        ambulances = [
            Ambulance(
                vehicle_number="LG-AMB-001",
                provider_name="LIFEGRID EMS",
                ambulance_type="advanced",
                latitude=27.5980,
                longitude=78.0520,
                status="available",
                oxygen_available=True,
                ventilator_available=True,
                paramedic_available=True,
                owner_auth_user_id="demo-ambulance-001",
                verification_status="verified",
                gps_source="provider_device",
                location_updated_at=datetime.now(timezone.utc),
            ),
            Ambulance(
                vehicle_number="LG-AMB-002",
                provider_name="LIFEGRID EMS",
                ambulance_type="basic",
                latitude=27.6100,
                longitude=78.0580,
                status="available",
                oxygen_available=True,
                ventilator_available=False,
                paramedic_available=True,
                owner_auth_user_id="demo-ambulance-002",
                verification_status="verified",
                gps_source="provider_device",
                location_updated_at=datetime.now(timezone.utc),
            ),
            Ambulance(
                vehicle_number="LG-AMB-003",
                provider_name="LIFEGRID Emergency Services",
                ambulance_type="advanced",
                latitude=27.9000,
                longitude=78.0850,
                status="available",
                oxygen_available=True,
                ventilator_available=True,
                paramedic_available=True,
                owner_auth_user_id="demo-ambulance-003",
                verification_status="verified",
                gps_source="provider_device",
                location_updated_at=datetime.now(timezone.utc),
            ),
        ]

        resources = [
            Resource(
                provider_name="LIFEGRID Blood Network",
                resource_type="blood",
                resource_name="O Positive Blood",
                quantity_available=8,
                latitude=27.5980,
                longitude=78.0500,
                status="available",
                verified=True,
                last_verified=datetime.now(timezone.utc),
            ),
            Resource(
                provider_name="LIFEGRID Blood Network",
                resource_type="blood",
                resource_name="B Positive Blood",
                quantity_available=5,
                latitude=27.6020,
                longitude=78.0550,
                status="available",
                verified=True,
                last_verified=datetime.now(timezone.utc),
            ),
            Resource(
                provider_name="LIFEGRID Medical Resources",
                resource_type="oxygen",
                resource_name="Medical Oxygen",
                quantity_available=20,
                latitude=27.6060,
                longitude=78.0580,
                status="available",
                verified=True,
                last_verified=datetime.now(timezone.utc),
            ),
            Resource(
                provider_name="LIFEGRID Medical Resources",
                resource_type="ventilator",
                resource_name="Emergency Ventilator",
                quantity_available=4,
                latitude=27.5950,
                longitude=78.0500,
                status="available",
                verified=True,
                last_verified=datetime.now(timezone.utc),
            ),
        ]

        db.add_all(hospitals)
        db.add_all(ambulances)
        db.add_all(resources)

        db.commit()

        print("LIFEGRID demo data inserted successfully.")

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()