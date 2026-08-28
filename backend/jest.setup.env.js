/* eslint-disable */
// Runs before any test module (and therefore before src/config/env.ts's
// `import "dotenv/config"`). Two jobs:
//   1. Load backend/.env.test so the suite targets a LOCAL throwaway Postgres.
//   2. Hard-refuse to run the integration suite against a hosted database —
//      the tests do writes + deleteMany teardowns, and must never touch prod.
const path = require("path");
const fs = require("fs");

const envTestPath = path.join(__dirname, ".env.test");
if (fs.existsSync(envTestPath)) {
  require("dotenv").config({ path: envTestPath, override: true });
}

const url = process.env.DATABASE_URL || "";
const looksHosted = /supabase\.co|\.pooler\.|amazonaws\.com|neon\.tech|render\.com|railway|\.rds\./i.test(url);
const looksLocal = /@localhost|@127\.0\.0\.1|host=\/(tmp|var)|@\[::1\]/i.test(url);

if (!url) {
  throw new Error("[jest.setup.env] DATABASE_URL is unset. Create backend/.env.test (see comment in that file).");
}
if (looksHosted || !looksLocal) {
  throw new Error(
    "[jest.setup.env] DATABASE_URL does not look like a local database:\n  " +
      url.replace(/:[^:@/]+@/, ":***@") +
      "\nThe integration suite writes and deletes rows — point it at a throwaway local Postgres via backend/.env.test.",
  );
}
