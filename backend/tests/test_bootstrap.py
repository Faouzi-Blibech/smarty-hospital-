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
