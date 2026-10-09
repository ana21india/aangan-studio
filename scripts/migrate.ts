// Applies any db/migrations/*.sql files not yet recorded. Run with: npm run migrate
// 0001 was applied by hand in the Neon SQL editor, so it is recorded without being re-run.
import { config } from "dotenv";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL in .env.local");
  const sql = neon(url);

  await sql.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  const done = new Set(((await sql.query("select name from schema_migrations")) as { name: string }[]).map((r) => r.name));
  const files = readdirSync("db/migrations").filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    if (done.has(file)) continue;
    if (file.startsWith("0001")) {
      const t = (await sql.query("select to_regclass('public.callers') as t")) as { t: string | null }[];
      if (t[0].t) {
        await sql.query("insert into schema_migrations (name) values ($1)", [file]);
        console.log(`${file}: already in place, recorded`);
        continue;
      }
    }
    // These files are plain statements separated by semicolons (no function bodies).
    const statements = readFileSync(join("db/migrations", file), "utf-8")
      .split(/;\s*(?:\r?\n|$)/)
      .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
      .filter(Boolean);
    for (const s of statements) await sql.query(s);
    await sql.query("insert into schema_migrations (name) values ($1)", [file]);
    console.log(`${file}: applied (${statements.length} statements)`);
  }
  console.log("migrations up to date");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
