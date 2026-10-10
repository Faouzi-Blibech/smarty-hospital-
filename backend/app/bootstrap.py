"""Company → hospital (spec §6.1): create the site's first admin, once, at installation.

    python -m app.bootstrap --email admin@hospital.tn --name "Hospital Admin"

Prints a one-time code (48 h). The admin opens the web app → "I have a code" and sets their own password. The
company keeps no login: the random initial password is never shown and the code dies after use.
"""

import argparse
import secrets
import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import codes
from app.auth.security import hash_password
from app.config import check_secrets, get_settings
from app.db import SessionLocal
from app.ids import new_id
from app.models import User
from app.services.audit import audit


def bootstrap(db: Session, email: str, name: str) -> str:
    email = email.strip().lower()
    if db.scalar(select(User.id).where(User.role == "admin", User.status == "active")):  # a disabled admin is no admin
        raise RuntimeError("an admin already exists: approve new accounts from the web app")
    if db.scalar(select(User.id).where(User.email == email)):
        raise RuntimeError(f"{email} is already used")
    u = User(id=new_id(db, "u"), email=email, name=name.strip(), role="admin", status="active",
             password_hash=hash_password(secrets.token_urlsafe(32)))
    db.add(u)
    db.flush()
    code, _ = codes.issue(db, "reset", issued_by=u.id, user_id=u.id)
    audit(db, None, "create", "user", u.id)
    return code


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Create the first hospital admin")
    ap.add_argument("--email", required=True)
    ap.add_argument("--name", required=True)
    args = ap.parse_args(argv)
    check_secrets(get_settings())
    with SessionLocal() as db:
        try:
            code = bootstrap(db, args.email, args.name)
        except RuntimeError as e:
            print(f"error: {e}", file=sys.stderr)
            return 2
        db.commit()
    print(f"Admin created: {args.email.strip().lower()}")
    print(f"One-time code (valid 48 h): {code}")
    print("Open the web app, choose 'I have a code', and set your password.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
