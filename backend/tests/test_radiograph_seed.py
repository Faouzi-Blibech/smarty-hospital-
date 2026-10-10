from app.models import ExamOrder, ExamResult, RadiographReading
from app.radiograph_seed import ASSETS, DEMO, seed_radiographs


def test_assets_exist_and_are_credited():
    credits = (ASSETS / "CREDITS.md").read_text(encoding="utf-8")
    for row in DEMO:
        assert (ASSETS / row["file"]).stat().st_size < 1_500_000
        assert row["file"] in credits
    assert "CC0" in credits


def test_seed_radiographs_idempotent(db, seeded):
    put = []
    assert seed_radiographs(db, put=lambda key, data, ct: put.append((key, ct))) == len(DEMO)
    assert len(put) == len(DEMO) and all(ct == "image/jpeg" for _, ct in put)
    assert db.query(RadiographReading).filter(RadiographReading.status == "queued").count() == len(DEMO)
    assert seed_radiographs(db, put=lambda *a: put.append(a)) == 0 and len(put) == len(DEMO)
    o = db.get(ExamOrder, "ex-0901")
    assert o.department == "Imaging" and o.status == "done" and db.get(ExamResult, "er-0901").content_type == "image/jpeg"
