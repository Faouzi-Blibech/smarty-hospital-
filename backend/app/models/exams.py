from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ExamOrder(Base):
    __tablename__ = "exam_orders"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), index=True)
    appointment_id: Mapped[str | None] = mapped_column(ForeignKey("appointments.id"), index=True)
    code: Mapped[str] = mapped_column(String)
    label: Mapped[str] = mapped_column(String)
    department: Mapped[str] = mapped_column(String, index=True)
    status: Mapped[str] = mapped_column(String, default="suggested")
    ai_suggested: Mapped[dict | None] = mapped_column(JSONB)
    human_confirmed_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    ordered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ExamResult(Base):
    __tablename__ = "exam_results"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    exam_order_id: Mapped[str] = mapped_column(ForeignKey("exam_orders.id"), index=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), index=True)
    uploaded_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    file_key: Mapped[str] = mapped_column(String)
    file_name: Mapped[str] = mapped_column(String)
    content_type: Mapped[str] = mapped_column(String)
    size_bytes: Mapped[int] = mapped_column(Integer)
    report_text: Mapped[str] = mapped_column(Text, default="", server_default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
