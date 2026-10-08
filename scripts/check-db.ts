// Quick sanity check of the database: npm run check:db
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const t = await sql.query("select count(*)::int as n from information_schema.tables where table_schema = 'public'");
  const c = await sql.query("select count(*)::int as n from config");
  const k = await sql.query("select name, version, sync_to_vaani from knowledge_docs order by name");
  console.log("tables:", t[0].n, "| config rows:", c[0].n);
  console.table(k);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
