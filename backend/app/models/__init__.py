"""One SQLAlchemy class per table in docs/contracts/data-model.md (v1.3: no `documents` table)."""

from app.models.ai import AiSummary
from app.models.audit import AuditLog
from app.models.clinical import Alert, Appointment, MedDose, Note, Prescription, Vital
from app.models.device import Device, IngestedMessage
from app.models.patient import Admission, Patient
from app.models.user import Staff, User

__all__ = ["AiSummary", "Admission", "Alert", "Appointment", "AuditLog", "Device", "IngestedMessage",
           "MedDose", "Note", "Patient", "Prescription", "Staff", "User", "Vital"]
