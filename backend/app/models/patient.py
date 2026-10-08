from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Patient(Base):
    __tablename__ = "patients"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    first_name: Mapped[str] = mapped_column(String)
    last_name: Mapped[str] = mapped_column(String)
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    sex: Mapped[str | None] = mapped_column(String)  # F | M
    phone: Mapped[str | None] = mapped_column(String)
    email: Mapped[str | None] = mapped_column(String)
    telegram_chat_id: Mapped[str | None] = mapped_column(String)
    ward: Mapped[str | None] = mapped_column(String)
    allergies: Mapped[list] = mapped_column(JSONB, default=list)
    history: Mapped[str] = mapped_column(Text, default="")
    attending_doctor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    wristband_rfid: Mapped[str | None] = mapped_column(String, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Admission(Base):
    __tablename__ = "admissions"
    __table_args__ = (  # one active admission per patient and per device
        Index("uq_adm_active_patient", "patient_id", unique=True, postgresql_where=text("discharged_at IS NULL")),
        Index("uq_adm_active_device", "device_id", unique=True,
              postgresql_where=text("discharged_at IS NULL AND device_id IS NOT NULL")),
    )
    id: Mapped[str] = mapped_column(String, primary_key=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"))
    device_id: Mapped[str | None] = mapped_column(ForeignKey("devices.id"))
    bed: Mapped[str] = mapped_column(String)
    admitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    discharged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
