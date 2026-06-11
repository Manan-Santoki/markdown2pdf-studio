import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PostgresCheck =
  | { ok: true; latency_ms: number }
  | { ok: false; error: string };

async function checkPostgres(): Promise<PostgresCheck> {
  // The editor and PDF export work without Postgres; an unset DATABASE_URL is
  // reported as a soft degradation instead of a failure.
  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "unconfigured" };
  }
  try {
    // Lazy import so a broken DB setup can never crash module load.
    const { getSql } = await import("@/lib/db");
    const sql = getSql();
    const start = Date.now();
    await sql`SELECT 1`;
    return { ok: true, latency_ms: Date.now() - start };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}

// If HEALTHSH_HEALTH_TOKEN is set, callers must present it (Bearer header or
// ?token= query param) to see check details; otherwise only `status` leaks.
function isAuthorized(request: Request): boolean {
  const token = process.env.HEALTHSH_HEALTH_TOKEN;
  if (!token) {
    return true;
  }
  const header = request.headers.get("authorization");
  if (header === `Bearer ${token}`) {
    return true;
  }
  return new URL(request.url).searchParams.get("token") === token;
}

export async function GET(request: Request) {
  const postgres = await checkPostgres();

  const status = postgres.ok ? "ok" : "degraded";
  // Only an unreachable (configured) database is a hard failure.
  const hardFailure = !postgres.ok && postgres.error !== "unconfigured";
  const httpStatus = hardFailure ? 503 : 200;

  if (!isAuthorized(request)) {
    return NextResponse.json({ status }, { status: httpStatus });
  }

  return NextResponse.json(
    {
      status,
      service: "binderly",
      checks: { postgres },
    },
    { status: httpStatus },
  );
}
