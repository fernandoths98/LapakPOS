#!/bin/sh
set -e

# Apply any pending Prisma migrations before the API starts. `migrate deploy`
# only runs already-generated migration files (never prompts, never resets),
# so it is safe to run on every container start.
echo "[entrypoint] prisma migrate deploy ..."
npx prisma migrate deploy

echo "[entrypoint] starting: $*"
exec "$@"
