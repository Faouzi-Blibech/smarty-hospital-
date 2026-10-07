from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.auth.security import create_token, verify_password
from app.db import get_db
from app.errors import ApiError
from app.models import User
from app.schemas import LoginIn, LoginOut, LoginUser, Me
from app.services.audit import audit

router = APIRouter(tags=["auth"])


@router.post("/auth/login", response_model=LoginOut)
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)) -> LoginOut:
    user = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    if user is None or not verify_password(body.password, user.password_hash):
        raise ApiError(401, "bad_credentials", "wrong email or password")
    audit(db, user, "login", "user", user.id, ip=request.client.host if request.client else "")
    db.commit()
    return LoginOut(access_token=create_token(user),
                    user=LoginUser(id=user.id, name=user.name, role=user.role, patient_id=user.patient_id))


@router.get("/me", response_model=Me)
def me(user: User = Depends(get_current_user)) -> User:
    return user
