import { neon } from "@neondatabase/serverless";

// Server-only database access (Neon Postgres). Never import this from a client component.
// Usage: const rows = await query<{ id: string }>("select id from callers where phone = $1", [phone]);
let cached: ReturnType<typeof neon> | null = null;

function client() {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL must be set");
  cached = neon(url);
  return cached;
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const rows = await client().query(text, params);
  return rows as T[];
}
