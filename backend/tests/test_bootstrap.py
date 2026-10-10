import pytest
from sqlalchemy import select

from app.auth import codes
from app.bootstrap import bootstrap
from app.models import User


def test_bootstrap_creates_admin_with_a_working_one_time_code(db):
    code = bootstrap(db, " Boss@Site.TN ", "Hospital Admin")
    u = db.scalar(select(User).where(User.email == "boss@site.tn"))
    assert (u.role, u.status) == ("admin", "active")
    assert codes.find_valid(db, "reset", code, user_id=u.id) is not None


def test_bootstrap_refuses_when_an_admin_exists(seeded):
    with pytest.raises(RuntimeError, match="already"):
        bootstrap(seeded, "other@site.tn", "Other")


def test_bootstrap_works_when_the_only_admin_is_disabled(seeded):
    seeded.get(User, "u-0004").status = "disabled"
    seeded.flush()
    code = bootstrap(seeded, "fresh@site.tn", "Fresh Admin")
    u = seeded.scalar(select(User).where(User.email == "fresh@site.tn"))
    assert (u.role, u.status) == ("admin", "active")
    assert codes.find_valid(seeded, "reset", code, user_id=u.id) is not None
    with pytest.raises(RuntimeError, match="already"):  # now there is an active one again
        bootstrap(seeded, "third@site.tn", "Third")
