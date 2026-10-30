# Builds the one-PC Windows program (owner 2026-10-30). Needs Python 3.12, Node 22 and, for the
# setup .exe, Inno Setup 6 (iscc on PATH). Run from the repo root in PowerShell:
#   .\local\build.ps1            -> dist\MobileShop\MobileShop.exe (+ dist\MobileShop-Setup-x.y.z.exe when iscc exists)
param([string]$Version = "2.0.0")
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "== web app (same-origin build)"
Push-Location frontend
$env:VITE_API_URL = ""
npm ci --no-audit --no-fund
npm run build
Pop-Location

Write-Host "== python bundle"
Push-Location backend
if (-not (Test-Path .venv-local)) { py -3.12 -m venv .venv-local }
.\.venv-local\Scripts\pip install -q -e ".[local]"
Pop-Location
$env:PYTHONUTF8 = "1"
backend\.venv-local\Scripts\pyinstaller --noconfirm --clean local\mobileshop.spec

$iscc = Get-Command iscc -ErrorAction SilentlyContinue
if ($iscc) {
  Write-Host "== setup .exe"
  & $iscc.Source "/DAppVersion=$Version" local\installer.iss
} else {
  Write-Host "Inno Setup (iscc) not found: dist\MobileShop\ is ready to zip; install Inno Setup 6 to get the Setup .exe"
}
