from datetime import datetime

from sqlalchemy import BigInteger, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class AuditLog(Base):
    """Append-only: the app writes and reads, never updates or deletes."""

    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    user_id: Mapped[str | None] = mapped_column(String)
    role: Mapped[str | None] = mapped_column(String)
    action: Mapped[str] = mapped_column(String)  # read | create | update | delete | login
    resource: Mapped[str] = mapped_column(String)
    resource_id: Mapped[str] = mapped_column(String, default="")
    patient_id: Mapped[str | None] = mapped_column(String)
    ip: Mapped[str] = mapped_column(String, default="")
