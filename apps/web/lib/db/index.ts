import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";
import { env } from "../env";

let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

/** Neon over HTTP: no connection pool to manage, suits short-lived functions and workflow steps. */
export function db() {
  if (!_db) _db = drizzle(neon(env.DATABASE_URL), { schema });
  return _db;
}

export { schema };
