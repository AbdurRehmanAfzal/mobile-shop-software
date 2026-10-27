"""The first login on a new server is made with `python -m app.cli create-owner` (public signup is off)."""

from app import cli
from app.modules.auth.models import User


def test_create_owner_makes_a_shop_and_login(engine, db, monkeypatch, capsys):
    from sqlalchemy.orm import sessionmaker

    monkeypatch.setattr(cli, "SessionLocal", sessionmaker(bind=engine, expire_on_commit=False))
    monkeypatch.setattr(cli.getpass, "getpass", lambda _prompt: "secret-123")
    args = [
        "create-owner",
        "--shop",
        "OOP Mobiles",
        "--name",
        "Abdur Rehman",
        "--phone",
        "0300 1234567",
    ]
    assert cli.main(args) == 0
    assert "login 03001234567" in capsys.readouterr().out
    assert db.query(User).filter_by(phone="03001234567").one().name == "Abdur Rehman"
    # the same number again is refused
    assert cli.main(args) == 1
    assert "already registered" in capsys.readouterr().out
