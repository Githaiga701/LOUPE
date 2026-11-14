/** Server-side environment. Read once; fail loudly on what is required. */
function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}. See .env.example.`);
  return v;
}

export const env = {
  get DATABASE_URL() { return req("DATABASE_URL"); },
  /** Base URL of the Python checks service, e.g. https://loupe-checks.vercel.app */
  get CHECKS_URL() { return process.env.CHECKS_URL ?? "http://localhost:8100"; },
  /** Shared secret both projects hold; sent as X-Loupe-Key. */
  get CHECKS_SHARED_SECRET() { return process.env.CHECKS_SHARED_SECRET ?? "dev-secret"; },
  /** Vercel "Protection Bypass for Automation" secret of the checks project, if it sits behind Vercel Authentication. */
  get CHECKS_BYPASS_SECRET() { return process.env.CHECKS_BYPASS_SECRET; },
  /** "fake" streams synthetic signals so the UI can be built without the checks service. */
  get CHECKS_MODE(): "live" | "fake" { return process.env.CHECKS_MODE === "fake" ? "fake" : "live"; },
  get RETENTION_HOURS_ANON() { return Number(process.env.RETENTION_HOURS_ANON ?? 24); },
  get CRON_SECRET() { return process.env.CRON_SECRET; },
};
