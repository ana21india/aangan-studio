// End-to-end test: sends a mock call, signed, to the deployed app and checks what landed in the database.
//   npm run e2e -- T01 https://aangan-studio-iota.vercel.app [+91XXXXXXXXXX]
// The optional phone number lets you test the whole caller flow with your own Telegram number
// (the bot matches the number you share to this call). Without it a random fake number is used.
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { MockVoiceProvider } from "../src/lib/voice/mock";
import { sign } from "../src/lib/voice/signature";

config({ path: ".env.local" });

async function main() {
  const [id, base, phoneArg] = process.argv.slice(2);
  if (!id || !base) throw new Error("Usage: npm run e2e -- T01 https://your-app.vercel.app [+91XXXXXXXXXX]");
  const secret = process.env.VAANI_WEBHOOK_SECRET;
  if (!secret) throw new Error("VAANI_WEBHOOK_SECRET is empty in .env.local");

  const enquiry = new MockVoiceProvider().replay().find((e) => e.id === id.toUpperCase());
  if (!enquiry) throw new Error(`No test enquiry ${id}`);
  const phone = phoneArg ?? `+915000${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
  const run = Date.now();
  const sql = neon(process.env.DATABASE_URL!);

  for (const [i, ev] of enquiry.events.entries()) {
    const body = JSON.stringify({ ...ev, providerCallId: `e2e-${run}-${enquiry.id}-${i + 1}`, callerPhone: phone, startedAt: new Date(Date.now() + i * 120_000) });
    const res = await fetch(`${base.replace(/\/$/, "")}/api/webhooks/vaani/call-ended`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-vaani-signature": sign(secret, body) },
      body,
    });
    console.log(`call ${i + 1}/${enquiry.events.length} (${ev.status}): HTTP ${res.status} ${await res.text()}`);
  }

  console.log("Waiting for processing...");
  for (let t = 0; t < 30; t++) {
    await new Promise((r) => setTimeout(r, 3000));
    const rows = (await sql.query(
      `select c.status, c.processing_state, c.processing_error, e.category, e.score, e.name,
              (select count(*)::int from handoffs h where h.enquiry_id = e.id) as handoffs,
              (select string_agg(x.reason, ',') from escalations x where x.enquiry_id = e.id) as escalations
       from calls c left join enquiries e on e.id = c.enquiry_id
       where c.provider_call_id like $1 order by c.started_at`, [`e2e-${run}-%`])) as Record<string, unknown>[];
    if (rows.length && rows.every((r) => r.processing_state !== "received")) {
      console.table(rows);
      console.log("Now check Telegram: the designers' group for a handoff, or the front-desk chat for an alert.");
      return;
    }
  }
  console.log("Timed out waiting. Check the Vercel logs.");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
