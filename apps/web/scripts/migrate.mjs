// Applies drizzle/ migrations during the Vercel *production* build only.
// Preview builds share the same Neon env vars, so they never migrate; locally
// and in CI the step is a no-op. Run `pnpm db:migrate` by hand for anything else.
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const env = process.env.VERCEL_ENV;
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (env !== "production") {
  console.log(`[migrate] skipped (VERCEL_ENV=${env ?? "unset"})`);
  process.exit(0);
}
if (!url) {
  console.error("[migrate] DATABASE_URL is not set; connect Neon to this project.");
  process.exit(1);
}

const db = drizzle(neon(url));
await migrate(db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
console.log("[migrate] database is up to date");
