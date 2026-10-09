from app.models import ExamOrder, ExamResult, NotebookEntry


def test_exam_rows_round_trip(seeded):
    db = seeded
    o = ExamOrder(id="ex-9001", patient_id="p-0001", appointment_id=None, code="ecg", label="ECG (12-lead)",
                  department="Cardiology", status="suggested", ai_suggested={"source": "rules", "bundles": ["x"]})
    db.add(o)
    db.flush()
    r = ExamResult(id="er-9001", exam_order_id="ex-9001", patient_id="p-0001", uploaded_by="u-0002",
                   file_key="exams/ex-9001/er-9001/a.pdf", file_name="a.pdf", content_type="application/pdf",
                   size_bytes=10)
    n = NotebookEntry(id="nb-0001", patient_id="p-0001", user_id="u-0001", question="q",
                      ai_suggested={"answer": "a", "citations": [], "source": "rules"})
    db.add_all([r, n])
    db.flush()
    db.refresh(o)
    assert o.created_at is not None and o.ordered_at is None and o.human_confirmed_by is None
    assert db.get(ExamResult, "er-9001").report_text == ""
    assert db.get(NotebookEntry, "nb-0001").human_confirmed_by is None
