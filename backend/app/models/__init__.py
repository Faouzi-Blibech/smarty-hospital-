"""One SQLAlchemy class per table in docs/contracts/data-model.md (v1.4: exams, notebook)."""

from app.models.ai import AiSummary, NotebookEntry
from app.models.audit import AuditLog
from app.models.clinical import Alert, Appointment, MedDose, Note, Prescription, Vital
from app.models.device import Device, IngestedMessage
from app.models.exams import ExamOrder, ExamResult
from app.models.patient import Admission, Patient
from app.models.user import Staff, User

__all__ = ["AiSummary", "Admission", "Alert", "Appointment", "AuditLog", "Device", "ExamOrder", "ExamResult",
           "IngestedMessage", "MedDose", "Note", "NotebookEntry", "Patient", "Prescription", "Staff", "User", "Vital"]
