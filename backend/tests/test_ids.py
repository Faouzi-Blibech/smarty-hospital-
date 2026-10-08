from app.ids import new_id


def test_new_id_is_prefixed_and_increments(db):
    a, b = new_id(db, "p"), new_id(db, "p")
    assert a.startswith("p-") and len(a) == 6
    assert int(b[2:]) == int(a[2:]) + 1


def test_dose_ids_are_wider(db):
    assert len(new_id(db, "d", width=6)) == 8
