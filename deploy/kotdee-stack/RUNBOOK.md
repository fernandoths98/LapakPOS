# Deploying the LapakPOS API to the kotdee-stack VPS

> **Deployment completed 2026-08-27.** See [DEPLOYED.md](./DEPLOYED.md) for
> the live configuration, verification results and safe maintenance commands.
> The sections below describe the original diagnosis/planning; their shared
> compose commands and TLS failure are superseded by the deployment record.

**Situation (2026-08-27):** the mobile app points at `https://lapak-api.kotdee.tech`
but no LapakPOS backend is deployed on `72.60.78.40`. The `n8n-traefik-1`
Traefik has no router for that host, so every request gets Traefik's default
404 + self-signed `TRAEFIK DEFAULT CERT`, which React Native rejects
("can't reach the server"). The Supabase database in `backend/.env` is
external and untouched.

This runbook stands the API up as `kotdee-lapak-api`, following the exact
pattern of the other `kotdee-*` API services.

---

## 0. Prerequisites / decisions

- **DNS:** `lapak-api.kotdee.tech` A record → `72.60.78.40` (already correct).
- **Secrets:** the repo's `backend/.env.example` currently contains the REAL
  production Supabase URL + JWT secret. Rotate both, make `.env.example` a
  placeholder, and put the real values only in the host `.env` (step 2).
- **TLS:** the server's ACME setup has been failing `tls-alpn-01` challenges
  (see §6). Decide the fix there before expecting a valid cert.
- Pick a free localhost port. In use: 12028, 14002, 14003, 14010, 14011,
  15001, 15002, 18081-18085, 19082, 5678. This runbook uses **14004** (app
  listens on 4004 inside the container).

## 1. Get the code onto the host

```bash
sudo mkdir -p /opt/kotdee-migration/source
cd /opt/kotdee-migration/source
git clone <this-repo-url> lapak
cd lapak
# or: rsync the working tree up, if the phase 0/1/2a changes aren't pushed yet
```

The build needs `backend/Dockerfile`, `backend/docker-entrypoint.sh`,
`.dockerignore` — all committed in this repo.

## 2. Create the host env file

```bash
cp /opt/kotdee-migration/source/lapak/backend/.env.example \
   /opt/kotdee-migration/source/lapak/backend/.env
# then edit and set the REAL (rotated) values:
#   DATABASE_URL=...        Supabase; keep the :5432 session-pooler host for migrations
#   JWT_SECRET=...          new secret (invalidates existing app logins — expected)
#   ANTHROPIC_API_KEY=      optional; AI features degrade gracefully if unset
#   PPOB_PROVIDER=mock      (or digiflazz + its keys)
#   NUSAPAY_INTERNAL_URL=http://kotdee-nusapay-gateway:4010   if PPOB should
#                          reuse the existing gateway container
chmod 600 /opt/kotdee-migration/source/lapak/backend/.env
```

## 3. Add the compose service

Append the block from `lapak-api.compose-snippet.yml` (this folder) under
`services:` in `/opt/kotdee-stack/compose.apps.yml`.

## 4. Build & start

```bash
cd /opt/kotdee-stack
docker compose -f compose.yml -f compose.apps.yml build lapak-api
docker compose -f compose.yml -f compose.apps.yml up -d lapak-api
docker logs -f kotdee-lapak-api
```

Expected in the logs:
```
[entrypoint] prisma migrate deploy ...
  Applying migration `20260827100000_product_category_set_null`
  Applying migration `20260827110000_outlet_inventory_foundation`
  Applying migration `20260827120000_outlet_scoped_operations`
[entrypoint] starting: node dist/src/index.js
... API listening on 0.0.0.0:4004
```

> **Take a Supabase snapshot before this first run** — the entrypoint applies
> the phase 0/1/2a migrations to the live DB. All three were verified against
> a copy of prod (backfills leave 0 orphan rows), but snapshot anyway.

Smoke test from the host:
```bash
curl -s localhost:14004/api/health          # -> {"ok":true,"service":"kotdee-pos-backend"}
curl -s -X POST localhost:14004/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@lapak.test","password":"<seed pw>"}'
```

## 5. Wire up Traefik

1. Open `/docker/n8n/dynamic/kotdee-core.yml`, find the `kotdee-super-api`
   router, and note its `entryPoints:` name and `tls.certResolver:` name.
2. Copy `kotdee-lapak.traefik.yml` (this folder) to
   `/docker/n8n/dynamic/kotdee-lapak.yml`, editing those two names to match.
3. Check whether Traefik shares the app network:
   ```bash
   docker network inspect kotdee-internal --format '{{range .Containers}}{{.Name}} {{end}}'
   ```
   - contains `n8n-traefik-1` → keep the `http://kotdee-lapak-api:4004` server URL.
   - does not → either add the network to the traefik service in
     `/docker/n8n/docker-compose.yml` and `docker compose up -d`, or switch
     the server URL to `http://host.docker.internal:14004` (needs
     `extra_hosts: ["host.docker.internal:host-gateway"]` on traefik).
4. Traefik's file provider auto-reloads; no restart needed. Verify:
   ```bash
   curl -skI https://lapak-api.kotdee.tech/api/health   # 200, Server: (none) but Express JSON on GET /api/health
   ```

## 6. Fix ACME / TLS (server-wide issue)

Traefik logs show, for `super-api.kotdee.tech` too:
`Cannot negotiate ALPN protocol "acme-tls/1" for tls-alpn-01 challenge` →
then Let's Encrypt rate-limit 429. So `tls-alpn-01` is broken for the whole
box, not just LapakPOS.

- First check if `super-api.kotdee.tech` currently serves a *valid* cert
  (`curl -vI https://super-api.kotdee.tech 2>&1 | grep -Ei 'issuer|CN='`).
  If it does, ACME recovered on its own and LapakPOS may just work after §5 —
  give it a few minutes and re-check the cert on `lapak-api.kotdee.tech`.
- If it's still the default cert: look at the Traefik `command:` / args in
  `/docker/n8n/docker-compose.yml` for the `certificatesresolvers.mytlschallenge.*`
  lines. Switching from
  `--certificatesresolvers.mytlschallenge.acme.tlschallenge=true`
  to
  `--certificatesresolvers.mytlschallenge.acme.httpchallenge=true`
  `--certificatesresolvers.mytlschallenge.acme.httpchallenge.entrypoint=web`
  uses HTTP-01 on port 80 (which this Traefik owns) and avoids the ALPN
  problem. This affects every domain on this Traefik — do it in a low-traffic
  window and `docker compose up -d n8n-traefik-1` to apply.
- Confirm nothing else is bound to :443:
  `ss -ltnp | grep ':443'` should show only the traefik process.

## 7. Point the app (already done)

`mobile/src/state/api/apiClient.ts` → `API_BASE_URL = "https://lapak-api.kotdee.tech"`.
No change needed once §5–6 are green. Rebuild + ship the app for the phase 0
fix regardless.

## Rollback

```bash
cd /opt/kotdee-stack
docker compose -f compose.yml -f compose.apps.yml stop lapak-api
docker compose -f compose.yml -f compose.apps.yml rm -f lapak-api
rm /docker/n8n/dynamic/kotdee-lapak.yml
```
The DB migrations are forward-only; to undo them restore the Supabase
snapshot from step 4.
