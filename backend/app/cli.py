"""Server-side commands. With public signup off, the product owner's own first login is made here:

    docker compose exec backend python -m app.cli create-owner

It asks for the shop, the name, the mobile number and the password (the password is never typed on
the command line, so it does not land in the shell history). Put the same number in SUPERUSER_PHONES
to get More > Super admin.
"""

import argparse
import getpass
import sys

from pydantic import ValidationError

from app.core.config import settings
from app.core.errors import AppError
from app.db.session import SessionLocal
from app.modules.auth.schemas import SignupRequest
from app.modules.auth.service import create_shop_with_owner


def create_owner(args: argparse.Namespace) -> int:
    shop = args.shop or input("Shop name: ").strip()
    name = args.name or input("Your name: ").strip()
    phone = args.phone or input("Mobile number (03XXXXXXXXX): ").strip()
    password = getpass.getpass("Password (min 6): ")
    if password != getpass.getpass("Password again: "):
        print("Passwords do not match.")
        return 1
    try:
        data = SignupRequest(
            shop_name=shop, owner_name=name, phone=phone, password=password, city=args.city
        )
    except ValidationError as e:
        print(
            "Not valid:",
            "; ".join(f"{'.'.join(map(str, x['loc']))}: {x['msg']}" for x in e.errors()),
        )
        return 1
    with SessionLocal() as db:
        try:
            user = create_shop_with_owner(db, data)
        except AppError as e:
            print("Refused:", e.message_en)
            return 1
    print(f"Done: {shop}, login {user.phone}.")
    if user.phone not in settings.superusers:
        print(
            f"For Super admin, add {user.phone} to SUPERUSER_PHONES in .env and restart the backend."
        )
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python -m app.cli")
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser(
        "create-owner", help="open a shop with its owner login (first login on a new server)"
    )
    c.add_argument("--shop")
    c.add_argument("--name")
    c.add_argument("--phone")
    c.add_argument("--city")
    args = p.parse_args(argv)
    return create_owner(args)


if __name__ == "__main__":
    sys.exit(main())
