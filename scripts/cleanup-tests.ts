// Deletes everything created by `npm run e2e` (calls whose provider_call_id starts with "e2e-") and the
// test callers behind them. Real data is never touched. Run with: npm run cleanup:tests
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = (await sql.query(
    `select id, caller_id, enquiry_id from calls where provider_call_id like 'e2e-%'`,
  )) as { id: string; caller_id: string | null; enquiry_id: string | null }[];
  if (!rows.length) { console.log("No test data found."); return; }

  const callIds = rows.map((r) => r.id);
  const enquiryIds = [...new Set(rows.map((r) => r.enquiry_id).filter(Boolean))] as string[];
  const callerIds = [...new Set(rows.map((r) => r.caller_id).filter(Boolean))] as string[];

  // Children first, so foreign keys are never violated.
  await sql.query("delete from cost_events where call_id = any($1::uuid[])", [callIds]);
  await sql.query("delete from escalations where call_id = any($1::uuid[]) or enquiry_id = any($2::uuid[])", [callIds, enquiryIds]);
  await sql.query("delete from handoffs where enquiry_id = any($1::uuid[])", [enquiryIds]);
  await sql.query("delete from bookings where enquiry_id = any($1::uuid[])", [enquiryIds]);
  await sql.query("delete from telegram_links where enquiry_id = any($1::uuid[])", [enquiryIds]);
  await sql.query("delete from calls where id = any($1::uuid[])", [callIds]);
  await sql.query("delete from enquiries where id = any($1::uuid[])", [enquiryIds]);
  await sql.query("delete from callers where id = any($1::uuid[])", [callerIds]);
  console.log(`Removed ${callIds.length} test calls, ${enquiryIds.length} enquiries, ${callerIds.length} test callers.`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
