"""Staff list for the admin screen (api.md 1.5 proposal `GET /staff`)."""

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.deps import require_roles
from app.db import get_db
from app.models import AuditLog, Staff, User
from app.schemas import iso

router = APIRouter(tags=["staff"])


@router.get("/staff")
def list_staff(user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)) -> list[dict]:
    last_login = dict(db.execute(select(AuditLog.user_id, func.max(AuditLog.ts))
                                 .where(AuditLog.action == "login").group_by(AuditLog.user_id)).all())
    out = []
    for u in db.scalars(select(User).where(User.role != "patient").order_by(User.id)):
        st = db.get(Staff, u.id)
        ward = st.ward if st else None
        out.append({"id": u.id, "name": u.name, "email": u.email, "role": u.role, "status": u.status, "ward": ward,
                    "scope": ward or "All wards", "last_login_at": iso(last_login.get(u.id))})
    return out
