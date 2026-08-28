# Redeploy: phases 3–5 (branch `feat/multi-outlet-freemium`)

Prod is at phase 2a (3 migrations applied, see DEPLOYED.md). This redeploy
brings the container up to branch tip `bbdb88f` and applies **11 pending
migrations**: `20260827130000_plancode_free` … `20260828120000_outlet_timezone`.
All 14 migrations verified end-to-end on a fresh Postgres 17.

App-side compatibility: the shipped APK already tolerates the current prod
backend (falls back for `Sale.cashierName`, `/import/template`, KATEGORI
import), so the APK and the backend can ship in either order — but the new
features only light up once this backend is live.

---

## 1. Merge PR #4  (GitHub — no CLI here)

https://github.com/fernandoths98/LapakPOS/compare/master...feat/multi-outlet-freemium?expand=1

16 feature commits + the security scrub. Body: `deploy/.../PR4-body.md` (or
the file shared in chat). After merge, note the new `master` SHA.

## 2. Rotate the leaked secrets  (Supabase dashboard + host)

`backend/.env.example` history still contains the real Supabase URL/password
and a real `JWT_SECRET`.

1. Supabase → Project Settings → Database → **reset database password**.
2. Pick a new long random `JWT_SECRET` (invalidates all current app logins —
   expected; users just log in again).
3. Update **only** the host env file on the VPS
   (`/opt/kotdee-migration/source/lapak/backend/.env`) with both new values.
   Never commit them. Keep the `:5432` session-pooler host for migrations.
4. (Later, separately) scrub git history — BFG or `git filter-repo` on
   `backend/.env.example`, then force-push + rotate again if anything already
   cloned it.

## 3. Snapshot the database  (before the container restart)

The entrypoint runs `prisma migrate deploy` on startup — 11 migrations with
backfills. Take a fresh public-schema dump first:

```sh
pg_dump "$PROD_DATABASE_URL" --schema=public --no-owner --no-privileges \
  -Fc -f /opt/kotdee-stack/backups/lapak/pre-phase3-5-$(date +%Y%m%d).dump
```

## 4. Rebuild & restart the container  (SSH root@72.60.78.40)

```sh
cd /opt/kotdee-migration/source/lapak
git fetch origin
git checkout master && git pull            # the merged PR #4
# do NOT touch backend/.env — it holds the rotated secrets from step 2

cd /opt/kotdee-stack
docker compose -p lapak -f compose.lapak.yml build lapak-api
docker compose -p lapak -f compose.lapak.yml up -d lapak-api
docker logs -f kotdee-lapak-api
```

Expect in the logs, in order:

```
Applying migration `20260827130000_plancode_free`
Applying migration `20260827130100_subscription_licensing`
Applying migration `20260827140000_franchise`
Applying migration `20260828100000_franchisee_partners`
Applying migration `20260828110000_partner_catalog_sync`
Applying migration `20260828120000_outlet_timezone`
... API listening on 0.0.0.0:4004
```

(`plancode_free` is an enum-add-only migration; PG can't use a new enum value
in the same tx as its creation — that's why it's its own migration.)

## 5. Smoke test

```sh
curl -s https://lapak-api.kotdee.tech/api/health
# licensing is live:
curl -s https://lapak-api.kotdee.tech/api/subscription/plans -H "Authorization: Bearer <owner token>"
# import template now 200s (was the 404 that started this):
curl -sI https://lapak-api.kotdee.tech/api/catalog/import/template -H "Authorization: Bearer <owner token>"
# rate limiter: 21 bad logins in a row -> last is 429
```

## 6. Ship the APK

`lapakpos-20260829-be6d723.apk` (built from `be6d723`; `bbdb88f` only changes
`.env.example`, so no rebuild needed). Debug-signed — fine for sideloading,
not Play Store. Points at `https://lapak-api.kotdee.tech`.

## Rollback

Container: `docker compose -p lapak -f compose.lapak.yml stop lapak-api` then
redeploy the previous image. DB: migrations are forward-only — restore the
step-3 dump into a fresh DB and repoint; never restore over live post-migration
writes.
