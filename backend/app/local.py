"""Mobile Shop on one PC (owner 2026-10-30, FR-PLT-04): the same backend with SQLite, serving the
built web app itself, started by a tray icon. No internet needed.

    python -m app.local            # dev: expects ../frontend/dist to exist
    MobileShop.exe                 # the PyInstaller bundle made by local/build.ps1

Data lives in %LOCALAPPDATA%\\MobileShop (database, uploads, settings, backups) so reinstalling or
updating the program never touches it."""

from __future__ import annotations

import os
import secrets
import shutil
import sys
import threading
import time
import webbrowser
from datetime import datetime
from pathlib import Path

HOST = "127.0.0.1"
PORT = int(os.environ.get("MOBILESHOP_PORT", "8787"))
URL = f"http://{HOST}:{PORT}"


def bundle_dir() -> Path:
    """Where the program's own files are: the PyInstaller folder or the repo's backend/."""
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    return Path(__file__).resolve().parent.parent


def data_dir() -> Path:
    base = os.environ.get("MOBILESHOP_DATA") or os.path.join(
        os.environ.get("LOCALAPPDATA") or str(Path.home()), "MobileShop"
    )
    p = Path(base)
    (p / "uploads").mkdir(parents=True, exist_ok=True)
    (p / "backups").mkdir(parents=True, exist_ok=True)
    return p


def load_settings(data: Path) -> None:
    """A `settings.env` in the data folder, written once with safe defaults, read into the
    environment before the app's config is imported. The shop can edit it (e.g. the AI key)."""
    env_file = data / "settings.env"
    if not env_file.exists():
        env_file.write_text(
            "\n".join(
                [
                    "# Mobile Shop (this PC). Lines starting with # are notes.",
                    "APP_ENV=prod",
                    f"SECRET_KEY={secrets.token_urlsafe(48)}",
                    f"DATABASE_URL=sqlite:///{(data / 'mobileshop.db').as_posix()}",
                    f"UPLOAD_DIR={(data / 'uploads').as_posix()}",
                    "PUBLIC_SIGNUP=true",
                    "LOCAL_MODE=true",
                    "SCHEDULER_ENABLED=true",
                    "WEBAUTHN_RP_ID=localhost",
                    f"WEBAUTHN_ORIGINS={URL},http://localhost:{PORT}",
                    f'CORS_ORIGINS=["{URL}","http://localhost:{PORT}"]',
                    "# optional: WhatsApp / email / AI keys, same names as deploy/.env.example",
                    "",
                ]
            ),
            encoding="utf-8",
        )
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())
    os.environ.setdefault("WEB_DIR", str(bundle_dir() / "web"))
    os.environ.setdefault("PYTHONUTF8", "1")


def migrate() -> None:
    from alembic.config import Config

    from alembic import command

    cfg = Config()
    cfg.set_main_option("script_location", str(bundle_dir() / "alembic"))
    cfg.set_main_option("sqlalchemy.url", os.environ["DATABASE_URL"])
    command.upgrade(cfg, "head")


def backup(data: Path) -> Path:
    """A dated copy of the database in the backups folder (and the Desktop, when there is one)."""
    import sqlite3

    stamp = datetime.now().strftime("%Y-%m-%d_%H-%M")
    dest = data / "backups" / f"mobileshop-{stamp}.db"
    src = sqlite3.connect(str(data / "mobileshop.db"))
    try:
        dst = sqlite3.connect(str(dest))
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()
    desktop = Path.home() / "Desktop"
    if desktop.is_dir():
        shutil.copy2(dest, desktop / dest.name)
    return dest


def serve() -> None:
    import uvicorn

    from app.main import app  # imported here, after settings.env is in the environment

    # MOBILESHOP_HOST=0.0.0.0 in settings.env opens the app to phones on the shop's Wi-Fi
    host = os.environ.get("MOBILESHOP_HOST", HOST)
    uvicorn.run(app, host=host, port=PORT, log_level="info")


def wait_ready(timeout: float = 30.0) -> bool:
    import urllib.request

    end = time.time() + timeout
    while time.time() < end:
        try:
            with urllib.request.urlopen(f"{URL}/health", timeout=2) as r:
                if r.status == 200:
                    return True
        except Exception:  # noqa: BLE001 - not up yet
            time.sleep(0.5)
    return False


def run_tray(data: Path) -> None:
    """A tray icon with Open / Backup / Quit; falls back to a console when pystray is missing."""
    try:
        import pystray
        from PIL import Image, ImageDraw
    except ImportError:
        print(f"Mobile Shop is running at {URL}  (Ctrl+C to stop)")
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            return

    img = Image.new("RGB", (64, 64), "#0B1F33")
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((18, 8, 46, 56), radius=6, fill="#6D5DF6")
    d.rectangle((24, 14, 40, 44), fill="#F4F6FA")

    def open_app(_icon=None, _item=None):
        webbrowser.open(URL)

    def do_backup(icon, _item=None):
        p = backup(data)
        icon.notify(f"Backup saved: {p.name}", "Mobile Shop")

    def quit_app(icon, _item=None):
        icon.stop()
        os._exit(0)

    icon = pystray.Icon(
        "MobileShop",
        img,
        "Mobile Shop",
        menu=pystray.Menu(
            pystray.MenuItem("Open Mobile Shop", open_app, default=True),
            pystray.MenuItem("Backup now", do_backup),
            pystray.MenuItem("Open data folder", lambda *_: os.startfile(str(data))),
            pystray.MenuItem("Quit", quit_app),
        ),
    )
    icon.run()


def _log_to_file(data: Path) -> None:
    """The window-less exe has no console: everything goes to mobileshop.log in the data folder."""
    log = open(data / "mobileshop.log", "a", encoding="utf-8", buffering=1)  # noqa: SIM115
    sys.stdout = log
    sys.stderr = log
    print(f"--- start {datetime.now():%Y-%m-%d %H:%M:%S} ---")


def _serve_logged() -> None:
    try:
        serve()
    except Exception:  # noqa: BLE001 - the log is the only place a user can look
        import traceback

        traceback.print_exc()


def main() -> int:
    data = data_dir()
    if getattr(sys, "frozen", False) or os.environ.get("MOBILESHOP_LOG"):
        _log_to_file(data)
    load_settings(data)
    try:
        migrate()
    except Exception:  # noqa: BLE001
        import traceback

        traceback.print_exc()
        return 1
    threading.Thread(target=_serve_logged, daemon=True).start()
    if wait_ready():
        webbrowser.open(URL)
    else:
        print("The server did not start; see the log in the data folder.")
    run_tray(data)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
