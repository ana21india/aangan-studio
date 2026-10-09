// Fills the database with fake calls so the dashboard can be checked with numbers in it.
// Every row is marked with provider_call_id "e2e-demo-..." so `npm run cleanup:tests` removes all of it.
// Run with: npm run seed:demo
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

// Small deterministic random generator, so the demo looks the same every time.
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(a: T[]): T => a[Math.floor(rand() * a.length)];

const NAMES = ["Priya Shah", "Suresh Patil", "Aarti Mehta", "Rahul Verma", "Smita Kulkarni", "Anand Sharma", "Neha Deshpande", "Girish Nair", "Pooja Rao", "Vivek Joshi", "Meera Iyer", "Kunal Bhatt"];
const AREAS = ["Kothrud", "Baner", "Wakad", "Aundh", "Hadapsar", "Viman Nagar", "Pimple Saudagar", "NIBM"];
const TRANSCRIPT = "Front Desk: Good morning, Aangan Studio.\nCaller: Hi, I have a 3BHK and want to redo the whole flat.\nFront Desk: Wonderful. What area is it in?\nCaller: Baner, about 1,200 sq ft.\n(demo data)";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const existing = (await sql.query("select count(*)::int n from calls where provider_call_id like 'e2e-demo-%'")) as { n: number }[];
  if (existing[0].n) { console.log("Demo data already present. Run npm run cleanup:tests first."); return; }

  const callers: string[] = [];
  for (let i = 0; i < 24; i++) {
    const r = (await sql.query("insert into callers (phone, name) values ($1, $2) returning id", [`+91500099${String(1000 + i)}`, NAMES[i % NAMES.length]])) as { id: string }[];
    callers.push(r[0].id);
  }

  const DAY = 86_400_000;
  const now = Date.now();
  let made = 0;
  for (let n = 0; n < 70; n++) {
    const daysAgo = Math.floor(Math.pow(rand(), 0.8) * 29);
    const hourIst = rand() < 0.68 ? 10 + Math.floor(rand() * 9) : pick([7, 8, 9, 20, 21, 22, 23, 1]);
    const started = new Date(now - daysAgo * DAY);
    started.setUTCHours(0, 0, 0, 0);
    const startedAt = new Date(started.getTime() + (hourIst * 60 - 330 + Math.floor(rand() * 50)) * 60_000);
    if (startedAt.getTime() > now) continue;
    const inHours = hourIst >= 10 && hourIst < 19;

    const roll = rand();
    const status = roll < 0.06 ? "missed" : roll < 0.12 ? "dropped" : roll < 0.18 ? "transferred" : "completed";
    const duration = status === "missed" ? 0 : status === "dropped" ? 40 + Math.floor(rand() * 50) : 150 + Math.floor(rand() * 260);
    const callerId = callers[n % callers.length];

    const call = (await sql.query(
      `insert into calls (caller_id, provider_call_id, channel, started_at, ended_at, duration_sec, in_hours, transcript, status, processing_state)
       values ($1,$2,'phone',$3,$4,$5,$6,$7,$8,'processed') returning id`,
      [callerId, `e2e-demo-${n}`, startedAt.toISOString(), new Date(startedAt.getTime() + duration * 1000).toISOString(), duration, inHours, status === "missed" ? null : TRANSCRIPT, status])) as { id: string }[];
    const callId = call[0].id;

    if (status === "missed" || status === "dropped") {
      await sql.query("insert into escalations (call_id, reason, urgent, routed_to, created_at, resolved_at) values ($1,$2,false,'frontdesk',$3,$4)",
        [callId, status === "missed" ? "missed_call" : "dropped_call", startedAt.toISOString(), rand() < 0.6 ? new Date(startedAt.getTime() + 3600_000).toISOString() : null]);
      await sql.query("insert into cost_events (call_id, line, quantity, unit_cost_inr, amount_inr, created_at) values ($1,'vaani_minutes',$2,8,$3,$4)",
        [callId, duration / 60, (duration / 60) * 8, startedAt.toISOString()]);
      continue;
    }

    const c = rand();
    const category = c < 0.45 ? "qualified" : c < 0.72 ? "not_qualified" : "unsure";
    const score = category === "qualified" ? 7 + Math.floor(rand() * 4) : category === "unsure" ? 4 + Math.floor(rand() * 3) : 1 + Math.floor(rand() * 4);
    const name = pick(NAMES);
    const pass = (r: string) => ({ status: "pass", reason: r });
    const criteria = {
      real_project: pass("Wants design and execution of the whole flat."),
      service_area: category === "not_qualified" && rand() < 0.5 ? { status: "fail", reason: "Site is in Nashik, outside Pune and PCMC." } : pass(`${pick(AREAS)} is inside the service area.`),
      timeline: category === "unsure" ? { status: "unclear", reason: "No timeline was given." } : pass("Wants it ready in about four months."),
      budget: pass("No budget mentioned, treated as fine."),
      decision_maker: pass("Owner, with the spouse's agreement."),
    };
    const enquiry = (await sql.query(
      `insert into enquiries (caller_id, status, name, space_type, size_sqft, location, city, scope, timeline_text, source, criteria, score, category, reasons, handoff_note, created_at)
       values ($1,$2,$3,'home',$4,$5,'Pune','full_interior',$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
      [callerId, category === "unsure" ? "open" : "resolved", name, 900 + Math.floor(rand() * 1200), pick(AREAS), category === "unsure" ? null : "ready by March", pick(["referral", "Instagram", "Google"]),
        JSON.stringify(criteria), score, category, JSON.stringify({ lines: [], notes: [] }),
        category === "qualified" ? `New qualified enquiry · score ${score}/10\nName: ${name}\n(demo data)` : null, startedAt.toISOString()])) as { id: string }[];
    const enquiryId = enquiry[0].id;
    await sql.query("update calls set enquiry_id = $2 where id = $1", [callId, enquiryId]);

    if (category === "qualified") {
      const accepted = rand() < 0.8;
      const sentAt = new Date(startedAt.getTime() + 60_000);
      const acceptMin = 2 + Math.floor(rand() * 40);
      const h = (await sql.query("insert into handoffs (enquiry_id, sent_at, accepted_by, accepted_at) values ($1,$2,$3,$4) returning id",
        [enquiryId, sentAt.toISOString(), accepted ? pick(["@asha_d", "@ravi_k", "@meena"]) : null, accepted ? new Date(sentAt.getTime() + acceptMin * 60_000).toISOString() : null])) as { id: string }[];
      void h;
      const linkSent = rand() < 0.75;
      await sql.query(
        `insert into telegram_links (enquiry_id, caller_id, start_token, started_at, link_sent_at, created_at) values ($1,$2,$3,$4,$5,$6)`,
        [enquiryId, callerId, `demo-${n}-${Math.floor(rand() * 1e9)}`, linkSent ? sentAt.toISOString() : null, linkSent ? sentAt.toISOString() : null, sentAt.toISOString()]);
      if (linkSent && rand() < 0.5) {
        await sql.query("insert into bookings (enquiry_id, cal_booking_id, scheduled_for, status, created_at) values ($1,$2,$3,$4,$5)",
          [enquiryId, `demo-booking-${n}`, new Date(startedAt.getTime() + 3 * DAY).toISOString(), rand() < 0.12 ? "cancelled" : "booked", new Date(startedAt.getTime() + 2 * 3600_000).toISOString()]);
      }
    }
    if (category === "unsure") {
      await sql.query("insert into escalations (call_id, enquiry_id, reason, urgent, routed_to, created_at, resolved_at) values ($1,$2,$3,$4,'frontdesk',$5,$6)",
        [callId, enquiryId, pick(["unsure", "budget_mismatch", "complaint", "decision_maker", "small_commercial"]), rand() < 0.15, startedAt.toISOString(), rand() < 0.5 ? new Date(startedAt.getTime() + 7200_000).toISOString() : null]);
    }

    await sql.query("insert into cost_events (call_id, line, quantity, unit_cost_inr, amount_inr, created_at) values ($1,'vaani_minutes',$2,8,$3,$4)", [callId, duration / 60, (duration / 60) * 8, startedAt.toISOString()]);
    await sql.query("insert into cost_events (call_id, line, quantity, unit_cost_inr, amount_inr, created_at) values ($1,'gemini_tokens',3000,0.00002,0.06,$2), ($1,'gemini_tokens',2200,0.00008,0.18,$2)", [callId, startedAt.toISOString()]);
    made++;
  }
  console.log(`Demo data added (${made} analysed calls plus some missed and dropped). Remove it with: npm run cleanup:tests`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
