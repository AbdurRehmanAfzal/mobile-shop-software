# Builds the React app, then serves it with Caddy on port 80 and proxies /api to the backend.
# HTTPS is done by the VPS's Traefik in front of it (see docker-compose.yml).
FROM node:22-alpine AS build
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend ./
ENV VITE_API_URL=
RUN npm run build

FROM caddy:2.8-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/dist /srv
EXPOSE 80
