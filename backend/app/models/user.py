from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True)
    password_hash: Mapped[str] = mapped_column(String)
    name: Mapped[str] = mapped_column(String)
    role: Mapped[str] = mapped_column(String)  # doctor | nurse | admin | patient
    # users <-> patients reference each other; use_alter breaks the cycle at CREATE time
    patient_id: Mapped[str | None] = mapped_column(
        ForeignKey("patients.id", use_alter=True, name="fk_users_patient_id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Staff(Base):
    __tablename__ = "staff"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    ward: Mapped[str | None] = mapped_column(String)
    rfid_uid: Mapped[str | None] = mapped_column(String, unique=True)
    telegram_chat_id: Mapped[str | None] = mapped_column(String)
