# LapakPOS deployment — 2026-08-27

## Live configuration

- VPS: `72.60.78.40`.
- Public API: `https://lapak-api.kotdee.tech` (mobile URL unchanged).
- Container: `kotdee-lapak-api`, image `kotdee-lapak-api:20260827`.
- Standalone Compose project: `lapak`; `/opt/kotdee-stack/compose.lapak.yml`.
- Source: `/opt/kotdee-migration/source/lapak`.
- Production env copied securely from the old VPS, mode 600, excluded from image.
- Host port: `127.0.0.1:14004` → container port `4004`.
- Persistent uploads/cache: `/opt/kotdee-stack/data/lapak/{uploads,cache}`.
- Docker network: `kotdee-internal`.
- NusaPay internal URL: `http://kotdee-nusapay-gateway:4010`.
- Traefik route: `/docker/n8n/dynamic/kotdee-lapak.yml`, file-provider reload.
- Let's Encrypt certificate issued successfully, expires 2026-11-25.
- No restart or configuration change to other API containers/shared Traefik.

## Database and cutover

The existing external Supabase database is retained. No reset or seed was run.
Only the application/files moved between VPS hosts; the schema was migrated
in place. The old `lapakpos.service` was stopped before backup/migrations.

Pre-migration public-schema backup on the new server:
`/opt/kotdee-stack/backups/lapak/pre-outlet-migration-20260827.dump`
(PostgreSQL 17 custom archive, 65,300 bytes, mode 600; archive listing verified).
This is not a full Supabase project backup and has not had a restore rehearsal.

Applied migrations:

- `20260827100000_product_category_set_null`
- `20260827110000_outlet_inventory_foundation`
- `20260827120000_outlet_scoped_operations`

The pending inventory migration was hardened before applying it: RLS is enabled
on `public.outlet_products`, with no public Data API policies. Backend Prisma
uses its existing trusted database role. Do not edit applied migration SQL.

Before/after counts match: 1 merchant, 2 users, 1 outlet, 3 categories,
9 products, 2 sales, 6 sale lines, 1 shift, 0 expenses, 2 PPOB transactions,
1 wallet, 2 wallet ledger entries and 1 top-up. All 9 outlet stock rows match
the original product stock; no missing or cross-merchant outlet references
were found in shifts, sales, expenses or PPOB transactions.

## Verification

- Shared/backend TypeScript build and Prisma generation passed.
- All migrations applied; container startup reports no pending migrations.
- Public HTTPS health check passes without disabling certificate validation.
- Supplied owner login returns HTTP 200 and a valid token with an outlet.
- HTTP 200: auth/me, products (9), categories (3), sales (2), home/alerts,
  recap/reports/weekly, PPOB billers (9), PPOB transactions (2), provider status.
- Digiflazz configuration reports `production`, configured. No real purchase,
  payment, top-up, or provider-side IP whitelist verification was performed.
- Phone UI/device login has not been tested in this deployment session.

## Maintenance

Run on the new VPS:

```sh
docker compose -p lapak -f /opt/kotdee-stack/compose.lapak.yml ps
docker logs --tail 100 kotdee-lapak-api
curl --fail --silent --show-error https://lapak-api.kotdee.tech/api/health
```

For future deployments, take a fresh backup first, sync reviewed source
(never overwrite production `.env`), then build/start only this Compose project.
Its entrypoint applies pending migrations automatically on startup.

Do not restart the old backend against the migrated database: its code is not
compatible with the new required outlet columns. Prefer a forward fix. A DB
restore requires a maintenance window and a fresh backup of post-cutover data;
never blindly restore the pre-migration archive over new transactions.

Existing security follow-up from the original runbook: sanitize any real
credentials in `.env.example` and coordinate their rotation separately.
No shared database credential/JWT rotation was performed during this cutover.
