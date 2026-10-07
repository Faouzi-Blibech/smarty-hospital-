from app.auth.security import hash_password, verify_password


def test_password_roundtrip():
    h = hash_password("ward1234")
    assert h != "ward1234"
    assert verify_password("ward1234", h)
    assert not verify_password("wrong", h)
