// Loads data/*.md into the knowledge_docs table.
// Run with: npm run seed:knowledge
// pricing.md is stored but never synced to Vaani (see DECISIONS.md D-013).
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

const DOCS: { name: string; syncToVaani: boolean }[] = [
  { name: "services.md", syncToVaani: true },
  { name: "qualified.md", syncToVaani: true },
  { name: "pricing.md", syncToVaani: false },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL in .env.local");
  const sql = neon(url);

  for (const doc of DOCS) {
    const content = readFileSync(join("data", doc.name), "utf-8");
    const existing = (await sql.query(
      "select content, version from knowledge_docs where name = $1",
      [doc.name],
    )) as { content: string; version: number }[];

    if (existing[0]?.content === content) {
      console.log(`${doc.name}: unchanged (v${existing[0].version})`);
      continue;
    }
    const version = (existing[0]?.version ?? 0) + 1;
    await sql.query(
      `insert into knowledge_docs (name, content, version, sync_to_vaani, updated_at)
       values ($1, $2, $3, $4, now())
       on conflict (name) do update
         set content = excluded.content, version = excluded.version,
             sync_to_vaani = excluded.sync_to_vaani, updated_at = now()`,
      [doc.name, content, version, doc.syncToVaani],
    );
    console.log(`${doc.name}: saved as v${version}${doc.syncToVaani ? "" : " (not synced to Vaani)"}`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
