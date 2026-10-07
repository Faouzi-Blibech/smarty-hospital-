from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Device(Base):
    __tablename__ = "devices"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    fw_version: Mapped[str | None] = mapped_column(String)
    online: Mapped[bool] = mapped_column(Boolean, default=False)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    schedule_version: Mapped[int] = mapped_column(Integer, default=0)
    schedule_acked_version: Mapped[int] = mapped_column(Integer, default=0)
    last_msg_id: Mapped[int | None] = mapped_column(BigInteger)  # diagnostics only


class IngestedMessage(Base):
    """Dedupe ledger for device → server messages: `INSERT … ON CONFLICT DO NOTHING`."""

    __tablename__ = "ingested_messages"
    device_id: Mapped[str] = mapped_column(String, primary_key=True)
    msg_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
