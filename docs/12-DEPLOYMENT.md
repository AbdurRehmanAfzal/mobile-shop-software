# 12 — Deployment (OOP Solutions VPS, Docker, GitHub Actions)

Decision (ADR-008, ADR-013): the SaaS runs on the owner's existing **Hostinger VPS `72.62.240.10`**, next to oopsolutions.com, n8n and the voice agent. It follows the same pattern as the website (`oop-solutions/website/deploy`, `oop-solutions/plan/07-infrastructure.md`):
- **Traefik** (`n8n-traefik-1`, Docker network `n8n_default`) already owns ports 80/443 and gets the HTTPS certificates. Our stack opens **no ports**; the `web` container joins `n8n_default` with Traefik labels.
- **GitHub Actions** deploys over SSH as the restricted `deploy` user, which may run exactly one command: `/opt/mobileshop/deploy.sh`.

## Stack (`deploy/docker-compose.yml`, project name `mobileshop`)
| Container | Image | Role |
|---|---|---|
| `db` | postgres:16-alpine | Data (volume `mobileshop_pgdata`); only on the stack's `internal` network |
| `backend` | `ghcr.io/abdurrehmanafzal/mobile-shop-backend:<sha>` (`backend/Dockerfile`) | FastAPI; runs `alembic upgrade head` on start; uploads in volume `mobileshop_uploads`; alias `mobileshop-backend` |
| `web` | `ghcr.io/abdurrehmanafzal/mobile-shop-web:<sha>` (`deploy/web.Dockerfile`) | Caddy on :80: the built React app + `/api`, `/health` → backend. Traefik in front does HTTPS |

## Pipeline
```
push develop / PR ──> CI (ci.yml)
    backend: ruff, pytest (SQLite), alembic up/down/up on PostgreSQL 16
    frontend: typecheck, vitest, build
    stack: production images run together on the runner + deploy/ci/smoke.sh
           (health, app page, signup, seeded catalogue, person, phone, report)

push main (release) ──> Deploy (deploy.yml)
    CI (same jobs) → build + push images to ghcr.io (tag = commit sha, and latest)
    → ssh deploy@VPS "sudo -n /opt/mobileshop/deploy.sh <sha>"
         pull → up -d → wait for /health → keep, or roll back to the previous tag
    → optional check of vars.APP_URL/health
```
Releases: merge `develop` into `main` and push `main` (the owner decides when).

## One-time setup
1. **Domain**: choose the address (e.g. `mobileshop.oopsolutions.com`). Hostinger DNS: A record → `72.62.240.10`.
2. **SSH key for CI** (if the website's key is reused, skip): `ssh-keygen -t ed25519 -f ~/.ssh/mobileshop_deploy -C deploy@github`; add the public key to `/home/deploy/.ssh/authorized_keys` on the VPS.
3. **On the VPS, as root** (the `deploy` user and Traefik already exist):
   ```
   git clone --depth 1 https://github.com/AbdurRehmanAfzal/mobile-shop-software.git /tmp/ms
   bash /tmp/ms/deploy/setup-vps.sh        # /opt/mobileshop, .env with fresh passwords, sudoers rule, nightly backup
   nano /opt/mobileshop/.env               # APP_DOMAIN, SUPERUSER_PHONES
   docker login ghcr.io -u AbdurRehmanAfzal  # only if the images are private (token with read:packages)
   ```
4. **GitHub** (repo → Settings → Secrets and variables → Actions): secrets `VPS_HOST=72.62.240.10`, `VPS_USER=deploy`, `VPS_SSH_KEY`; variable `APP_URL=https://<domain>`.
5. **First release**: merge develop → main and push, or run the Deploy workflow by hand. Watch: `docker compose -f /opt/mobileshop/docker-compose.yml logs -f backend`.
6. **First login** (signup is closed, so make it on the server; it asks for the password without echoing it):
   ```
   cd /opt/mobileshop && docker compose exec backend python -m app.cli create-owner
   ```
   Use the number that is in `SUPERUSER_PHONES`. Then open `https://<domain>`, log in, and open customer shops from More → Super admin.

## Day to day
- Status: `cd /opt/mobileshop && docker compose ps`
- Logs: `docker compose logs --tail 100 backend`
- Current version: `cat /opt/mobileshop/.current-tag`
- Roll back by hand: `sudo /opt/mobileshop/deploy.sh <older sha>` (note: migrations are not undone; a rollback across a schema change needs a DB restore)

## Backups
`setup-vps.sh` installs a cron job (02:30): `pg_dump` + uploads to `/opt/mobileshop-backups`, kept 14 days (`deploy/backup.sh`). Copy them off the server regularly (e.g. rclone to Google Drive).

Restore:
```
cd /opt/mobileshop
docker compose exec -T db pg_restore -U mobileshop -d mobileshop --clean < /opt/mobileshop-backups/db-YYYYMMDD-HHMM.dump
```

## Production safeguards in code
- `APP_ENV=prod` refuses to start with the default `SECRET_KEY` and hides `/docs`.
- CORS limited to `https://APP_DOMAIN` (+ Capacitor origins).
- `PUBLIC_SIGNUP=false`: only the super user opens shops.
- Caddy: HSTS, nosniff, frame and referrer policy, camera allowed only for this site (IMEI scan, ID photos); 10 MB upload limit.

## Status
- Live since 2026-10-27 at https://mobileshop.oopsolutions.com (first deploy 6cec924). CI stack job and deploy green.
- Live camera scanning needs HTTPS: test it on the live domain.
