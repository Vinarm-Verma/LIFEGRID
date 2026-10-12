from datetime import datetime, timezone
import os
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from app.auth import get_current_user, require_roles
from app.database.database import engine, IS_SQLITE

router = APIRouter()

VALID_STATUSES = {"requested", "accepted", "rejected"}
ALIASES = {"accept":"accepted","approve":"accepted","approved":"accepted","reject":"rejected","decline":"rejected","declined":"rejected","request":"requested","pending":"requested"}

def now(): return datetime.now(timezone.utc)

class HospitalResponseRequest(BaseModel):
    hospital_id: int | None = None
    status: str

def normalize(value: str):
    status = ALIASES.get(value.strip().lower(), value.strip().lower())
    if status not in VALID_STATUSES:
        raise HTTPException(400, "Hospital response status must be requested, accepted, or rejected.")
    return status

def get_owned_hospital(connection, user):
    row = connection.execute(text("select id,name,verification_status from hospitals where owner_auth_user_id=:uid and is_active=true limit 1"), {"uid":str(user["id"])}).mappings().first()
    if not row and IS_SQLITE and os.getenv("LIFEGRID_LOCAL_DEMO", "true").lower() in {"1", "true", "yes", "on"}:
        row = connection.execute(text("select id,name,verification_status from hospitals where is_active=true order by id limit 1")).mappings().first()
    return row

@router.get("/api/emergencies/{emergency_id}/hospital-response")
def get_response(emergency_id:int, user:dict=Depends(get_current_user)):
    with engine.connect() as c:
        row=c.execute(text("""select r.id,r.emergency_id,r.hospital_id,r.status,r.responded_at,r.updated_at,h.name as hospital_name from emergency_hospital_responses r left join hospitals h on h.id=r.hospital_id where r.emergency_id=:eid limit 1"""),{"eid":emergency_id}).mappings().first()
    if not row: return {"emergency_id":emergency_id,"hospital_id":None,"status":None,"responded_at":None,"updated_at":None}
    return dict(row)

@router.get("/api/hospital/incoming-emergencies")
def incoming(user:dict=Depends(require_roles("hospital"))):
    with engine.connect() as c:
        hospital=get_owned_hospital(c,user)
        if not hospital: raise HTTPException(404,"No hospital facility is linked to this account.")
        rows=c.execute(text("""select e.id,e.emergency_type,e.description,e.patient_count,e.severity,e.severity_score,e.latitude,e.longitude,e.location_description,e.status,e.ai_summary,e.required_resources,e.created_at,e.updated_at,r.status as hospital_response_status,r.responded_at from emergencies e join emergency_hospital_responses r on r.emergency_id=e.id where r.hospital_id=:hid and r.status='requested' and e.status not in ('completed','closed','cancelled','resolved') order by e.severity_score desc nulls last,e.created_at asc"""),{"hid":hospital["id"]}).mappings().all()
    return {"hospital":dict(hospital),"emergencies":[dict(x) for x in rows]}

@router.post("/api/emergencies/{emergency_id}/hospital-response")
def save_response(emergency_id:int,payload:HospitalResponseRequest,user:dict=Depends(require_roles("hospital","coordinator","admin"))):
    status=normalize(payload.status); stamp=now()
    with engine.begin() as c:
        emergency=c.execute(text("select id,selected_hospital_id,status from emergencies where id=:eid"),{"eid":emergency_id}).mappings().first()
        if not emergency: raise HTTPException(404,f"Emergency {emergency_id} not found.")
        requested_hospital=payload.hospital_id or emergency["selected_hospital_id"]
        if user.get("role")=="hospital":
            owned=get_owned_hospital(c,user)
            if not owned: raise HTTPException(404,"No hospital facility is linked to this account.")
            if requested_hospital is not None and int(requested_hospital)!=int(owned["id"]): raise HTTPException(403,"This hospital cannot respond for another facility.")
            requested_hospital=owned["id"]
            if emergency["selected_hospital_id"] is not None and int(emergency["selected_hospital_id"])!=int(owned["id"]): raise HTTPException(403,"This emergency is assigned to a different hospital.")
        if requested_hospital is None: raise HTTPException(409,"No hospital is assigned to this emergency yet.")
        c.execute(text("""insert into emergency_hospital_responses(emergency_id,hospital_id,status,responded_at,updated_at) values(:eid,:hid,:status,:stamp,:stamp) on conflict(emergency_id) do update set hospital_id=excluded.hospital_id,status=excluded.status,updated_at=excluded.updated_at,responded_at=case when excluded.status in ('accepted','rejected') then excluded.responded_at else emergency_hospital_responses.responded_at end"""),{"eid":emergency_id,"hid":requested_hospital,"status":status,"stamp":stamp})
        if status=="accepted":
            new_status="hospital_accepted"
        elif status=="rejected":
            new_status="hospital_rejected"
        else:
            new_status=emergency["status"]
        if new_status != emergency["status"]:
            c.execute(text("update emergencies set status=:status,updated_at=:stamp where id=:eid"),{"status":new_status,"stamp":stamp,"eid":emergency_id})
    return {"success":True,"emergency_id":emergency_id,"hospital_id":requested_hospital,"status":status,"message":f"Hospital response {status} and persisted."}
