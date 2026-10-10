"""Demo radiographs: CC0 teaching images (see ai/assets/radiographs/CREDITS.md) attached to synthetic patients,
each with a queued AI reading. Needs MinIO, so it runs from `python -m app.seed`, not from seed() (tests)."""

from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy.orm import Session

from app.ids import reserve_upto
from app.models import ExamOrder, ExamResult, RadiographReading
from app.services import storage

ASSETS = Path(__file__).parent / "ai" / "assets" / "radiographs"
DEMO = [
    {"n": 1, "patient": "p-0001", "code": "chest_xray", "label": "Chest X-ray", "file": "chest_pa_normal.jpg"},
    {"n": 2, "patient": "p-0002", "code": "chest_xray", "label": "Chest X-ray", "file": "chest_lobar_pneumonia.jpg"},
    {"n": 3, "patient": "p-0003", "code": "xray", "label": "X-ray — right foot", "file": "foot_dp_normal.jpg"},
    {"n": 4, "patient": "p-0004", "code": "xray_outside", "label": "Outside X-ray — wrist", "file": "wrist_barton_fracture.jpg"},
    {"n": 5, "patient": "p-0005", "code": "xray", "label": "X-ray — hip", "file": "hip_prosthesis_ap.jpg"},
    {"n": 6, "patient": "p-0006", "code": "xray", "label": "X-ray — cervical spine", "file": "cervical_spine.jpg"},
]


def seed_radiographs(db: Session, put=None) -> int:
    put = put or storage.put
    now, added = datetime.now(UTC), 0
    for d in DEMO:
        oid, rid, rrid = f"ex-09{d['n']:02d}", f"er-09{d['n']:02d}", f"rr-09{d['n']:02d}"
        if db.get(ExamOrder, oid) is not None:
            continue
        outside = d["code"] == "xray_outside"
        db.add(ExamOrder(id=oid, patient_id=d["patient"], code=d["code"], label=d["label"], department="Imaging",
                         status="done", human_confirmed_by="u-0001", ordered_at=now, done_at=now))
        db.flush()
        key = f"exams/{oid}/{rid}/{d['file']}"
        data = (ASSETS / d["file"]).read_bytes()
        put(key, data, "image/jpeg")
        db.add(ExamResult(id=rid, exam_order_id=oid, patient_id=d["patient"],
                          uploaded_by="u-0001" if outside else "u-0006", file_key=key, file_name=d["file"],
                          content_type="image/jpeg", size_bytes=len(data)))
        db.flush()
        db.add(RadiographReading(id=rrid, exam_result_id=rid, patient_id=d["patient"], status="queued",
                                 hint=d["label"]))
        added += 1
    db.flush()
    for prefix in ("ex", "er", "rr"):
        reserve_upto(db, prefix, 900 + len(DEMO))
    return added
