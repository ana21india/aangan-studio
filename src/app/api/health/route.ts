import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// Reports whether the app can reach the database and whether the knowledge docs are loaded.
// Returns no secrets and no personal data.
export async function GET() {
  try {
    const docs = await query("select name, version, sync_to_vaani from knowledge_docs order by name");
    return NextResponse.json({ ok: true, knowledge_docs: docs });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 503 },
    );
  }
}
