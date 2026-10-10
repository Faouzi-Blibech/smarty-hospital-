from app.models import ExamOrder, ExamResult, RadiographReading


def make_result(db, *, code="chest_xray", content_type="image/png", patient="p-0001", n=1):
    o = ExamOrder(id=f"ex-80{n:02d}", patient_id=patient, code=code, label="Chest X-ray", department="Imaging",
                  status="done", human_confirmed_by="u-0001")
    db.add(o)
    db.flush()
    r = ExamResult(id=f"er-80{n:02d}", exam_order_id=o.id, patient_id=patient, uploaded_by="u-0006",
                   file_key=f"exams/{o.id}/x.png", file_name="x.png", content_type=content_type, size_bytes=10)
    db.add(r)
    db.flush()
    return o, r


def test_reading_roundtrip(db, seeded):
    _, r = make_result(db)
    db.add(RadiographReading(id="rr-8001", exam_result_id=r.id, patient_id="p-0001", hint="Chest X-ray"))
    db.flush()
    got = db.get(RadiographReading, "rr-8001")
    assert got.status == "queued" and got.ai_suggested is None and got.final_text is None
