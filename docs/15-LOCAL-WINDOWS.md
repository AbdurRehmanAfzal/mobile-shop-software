# 15 — Mobile Shop on one PC (Windows, no internet)

Owner (2026-10-30): for shops without reliable internet. The same backend runs on the shop's PC with
SQLite and serves the same web app; phones on the shop's Wi-Fi can open it too. No cloud account,
no monthly server; one shop per install (FR-PLT-04). Cloud sync (FR-PLT-05) is not built.

## What the shop gets
- `MobileShop-Setup-<version>.exe`: installs to `Program Files\Mobile Shop`, Start Menu + Desktop
  shortcut, optional "start with Windows".
- **MobileShop.exe** puts an icon in the tray and opens the browser at `http://127.0.0.1:8787`.
  Tray menu: Open Mobile Shop · Backup now · Open data folder · Quit.
- First run: the shop creates its own account (public signup is on for this one PC), then logs in
  as usual. Staff log in on the same PC or from phones on the Wi-Fi at `http://<PC-IP>:8787`
  (allow the port in Windows Firewall; the tray app binds to 127.0.0.1 by default — set
  `MOBILESHOP_HOST=0.0.0.0` in `settings.env` to open it to the Wi-Fi).
- Data in `%LOCALAPPDATA%\Mobile Shop` → `MobileShop\`: `mobileshop.db`, `uploads\`, `backups\`,
  `settings.env`. Updates and uninstalls never touch it.
- **Backup now** writes `backups\mobileshop-<date>.db` and a copy on the Desktop. Restore = quit,
  copy a backup over `mobileshop.db`, start again.
- `settings.env` holds the same names as `deploy/.env.example` (WhatsApp, SMTP, AI key…); these need
  internet when used, everything else works offline. A random `SECRET_KEY` is written on first run.

## How it is built
- `backend/app/local.py` — the launcher: data folder, `settings.env`, Alembic `upgrade head`
  (migrations bundled), uvicorn in a thread, browser, tray (pystray; console fallback).
- `WEB_DIR` — new backend setting: when set, `app/main.py` mounts the built web app (`/assets` as
  static files, every other non-API path → `index.html`). The bundle sets it to its own `web\`.
- `local/mobileshop.spec` (PyInstaller, one folder), `local/installer.iss` (Inno Setup 6),
  `local/build.ps1` (frontend build with `VITE_API_URL=""` → PyInstaller → ISCC).
- `.github/workflows/windows.yml` builds it on a Windows runner (by hand with a version, or on a
  release when local/backend/frontend changed), smoke-tests the exe (`/health`, the app shell) and
  uploads `MobileShop-Setup-<version>.exe` as the run's artifact.
- Python extra `backend[local]` = pyinstaller, pystray, pillow.

## Build on a PC
```
.\local\build.ps1 -Version 2.1.0
```
needs Python 3.12, Node 22 and Inno Setup 6 (`iscc` on PATH) for the Setup .exe; without Inno
Setup you still get `dist\MobileShop\` to zip.

## Known limits
- One shop per PC. `LOCAL_MODE=true` (written to `settings.env`) makes the shop's organisation
  `chain` with no expiry, so the plan gate never locks a shop that pays no server. The super-admin
  screens are not needed locally.
- No automatic cloud backup: the Desktop copy is the shop's responsibility (or a USB stick).
- Printing uses the PC's browser print dialog, as on the website.
