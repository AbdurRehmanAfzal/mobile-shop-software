# PyInstaller recipe for the one-PC build (owner 2026-10-30). Run from the repo root:
#   pyinstaller local/mobileshop.spec
# Produces dist/MobileShop/ with MobileShop.exe, the alembic migrations and the built web app.

import os
from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

ROOT = Path(SPECPATH).resolve().parent
BACKEND = ROOT / "backend"
WEB = ROOT / "frontend" / "dist"
if not WEB.is_dir():
    raise SystemExit("frontend/dist is missing: run `npm run build` in frontend/ first")

hidden = (
    collect_submodules("app")
    + collect_submodules("alembic")
    + collect_submodules("sqlalchemy.dialects.sqlite")
    + collect_submodules("pystray")
    + ["uvicorn.logging", "uvicorn.loops", "uvicorn.loops.auto", "uvicorn.protocols",
       "uvicorn.protocols.http", "uvicorn.protocols.http.auto", "uvicorn.protocols.websockets",
       "uvicorn.protocols.websockets.auto", "uvicorn.lifespan", "uvicorn.lifespan.on",
       "passlib.handlers.bcrypt", "barcode", "barcode.codex", "barcode.writer", "tzdata"]
)

datas = [
    (str(BACKEND / "alembic"), "alembic"),
    (str(BACKEND / "alembic.ini"), "."),
    (str(WEB), "web"),
]
datas += collect_data_files("barcode")
# Windows has no system time-zone database: ship Python's tzdata (Asia/Karachi and friends)
datas += collect_data_files("tzdata")
datas += collect_data_files("alembic")

a = Analysis(
    [str(BACKEND / "app" / "local.py")],
    pathex=[str(BACKEND)],
    binaries=[],
    datas=datas,
    hiddenimports=hidden,
    hookspath=[],
    excludes=["tkinter", "pytest", "playwright"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="MobileShop",
    console=False,
    icon=str(ROOT / "local" / "mobileshop.ico") if (ROOT / "local" / "mobileshop.ico").exists() else None,
)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name="MobileShop")
