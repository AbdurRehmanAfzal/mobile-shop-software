# 12 — Deployment (Hostinger VPS)

Decision (ADR-008): the SaaS runs on the owner's **Hostinger VPS** with Docker Compose. Hostinger **shared hosting** cannot run FastAPI/PostgreSQL long-running processes; it can later host a static marketing/landing page.

## Stack on the VPS
| Container | Image | Role |
|---|---|---|
| `db` | postgres:16-alpine | Data (volume `pgdata`) |
| `backend` | built from `backend/Dockerfile` | FastAPI; runs `alembic upgrade head` on start; uploads in volume `uploads` |
| `web` | built from `deploy/web.Dockerfile` | Caddy: serves the built React app, proxies `/api` + `/health`, gets HTTPS certificates automatically |

Only ports 80/443 are open; the database is not exposed.

## One-time setup
1. **Domain**: point an A record (e.g. `app.yourdomain.pk`) to the VPS IP. Wait until `ping app.yourdomain.pk` shows the VPS IP.
2. **VPS OS**: Ubuntu 22.04/24.04. In hPanel you can pick the "Ubuntu with Docker" template, or install Docker:
   ```
   curl -fsSL https://get.docker.com | sh
   ```
3. **Firewall**: allow 22, 80, 443 only (`ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable`).
4. **Code**:
   ```
   git clone https://github.com/AbdurRehmanAfzal/mobile-shop-software.git /opt/mobileshop
   cd /opt/mobileshop && git checkout develop
   cp deploy/.env.example deploy/.env
   nano deploy/.env        # fill APP_DOMAIN, ACME_EMAIL, POSTGRES_PASSWORD, SECRET_KEY
   ```
   Generate secrets with `openssl rand -hex 32`.
5. **Start**:
   ```
   docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
   docker compose -f deploy/docker-compose.yml logs -f backend
   ```
   Open `https://app.yourdomain.pk` → sign up the first shop.
6. **Backups**: `chmod +x deploy/backup.sh` and add the cron line from the top of that file. Copy backups off the server regularly (e.g. to Google Drive with rclone).

## Updating
```
cd /opt/mobileshop && git pull
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
```
Migrations run automatically on backend start.

## Restore
```
docker compose -f deploy/docker-compose.yml exec -T db pg_restore -U mobileshop -d mobileshop --clean < /opt/mobileshop-backups/db-YYYYMMDD-HHMM.dump
```

## Production safeguards in code
- `APP_ENV=prod` refuses to start with the default `SECRET_KEY` and hides `/docs`.
- CORS limited to `https://APP_DOMAIN`.

## Not yet verified
- The stack has not been run against a real PostgreSQL yet (tests use SQLite). First deploy should be watched; run the smoke checks below.
- Smoke checks after deploy: `curl https://APP_DOMAIN/health`, sign up, add a party, buy a device, sell it, print the receipt.
