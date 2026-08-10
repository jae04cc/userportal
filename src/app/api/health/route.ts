import { NextResponse } from "next/server";
import { ensureDbReady, db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Unauthenticated liveness probe, for Uptime Kuma to monitor the portal itself.
 *
 * Deliberately reveals nothing beyond up/down: no version, no counts, no
 * configuration. It touches the database because a portal that can't read
 * SQLite is down even if the process is still answering.
 */
export async function GET() {
  try {
    await ensureDbReady();
    await db.get(sql`SELECT 1`);
    return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(
      { status: "error" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
