import { query } from "../db";
import { daysIn, monthsTouched, type Range } from "./range";

const win = (r: Range) => [r.from.toISOString(), r.to.toISOString()];

export interface Overview {
  calls: { total: number; inHours: number; afterHours: number; completed: number; dropped: number; missed: number; transferred: number };
  perDay: { day: string; inHours: number; afterHours: number }[];
  outcomes: { qualified: number; notQualified: number; unsure: number; pending: number };
  handoffs: { sent: number; accepted: number; medianAcceptMinutes: number | null };
  bookings: { booked: number; cancelled: number };
  escalations: { reason: string; total: number; open: number }[];
  costs: CostSummary;
}

export interface CostSummary {
  byLine: { line: string; amount: number; quantity: number }[];
  variable: number;
  fixed: number;
  fixedBreakdown: { name: string; perMonth: number; months: number; amount: number }[];
  total: number;
  perQualifiedLead: number | null;
  perBooking: number | null;
  perCall: number | null;
}

export const LINE_LABEL: Record<string, string> = {
  vaani_minutes: "Vaani (call minutes)",
  gemini_tokens: "Gemini (AI scoring)",
  sms: "SMS",
  fixed_monthly: "Fixed monthly plans",
};

function fixedPlans(): Record<string, number> {
  try {
    const parsed = JSON.parse(process.env.COST_FIXED_MONTHLY_INR || "{}") as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === "number" && v > 0)) as Record<string, number>;
  } catch {
    return {};
  }
}

export async function costSummary(r: Range, qualified: number, booked: number, totalCalls: number): Promise<CostSummary> {
  const [from, to] = win(r);
  const rows = await query<{ line: string; amount: number; quantity: number }>(
    `select line, coalesce(sum(amount_inr),0)::float as amount, coalesce(sum(quantity),0)::float as quantity
     from cost_events where created_at >= $1 and created_at < $2 and line <> 'fixed_monthly' group by line order by line`, [from, to]);
  const variable = rows.reduce((s, x) => s + x.amount, 0);
  const months = monthsTouched(r).length;
  const fixedBreakdown = Object.entries(fixedPlans()).map(([name, perMonth]) => ({ name, perMonth, months, amount: perMonth * months }));
  const fixed = fixedBreakdown.reduce((s, x) => s + x.amount, 0);
  const total = variable + fixed;
  return {
    byLine: rows, variable, fixed, fixedBreakdown, total,
    perQualifiedLead: qualified ? total / qualified : null,
    perBooking: booked ? total / booked : null,
    perCall: totalCalls ? total / totalCalls : null,
  };
}

export async function overview(r: Range): Promise<Overview> {
  const [from, to] = win(r);
  const [c] = await query<Record<string, number>>(
    `select count(*)::int total,
            count(*) filter (where in_hours)::int in_hours,
            count(*) filter (where in_hours = false)::int after_hours,
            count(*) filter (where status = 'completed')::int completed,
            count(*) filter (where status = 'dropped')::int dropped,
            count(*) filter (where status = 'missed')::int missed,
            count(*) filter (where status = 'transferred')::int transferred
     from calls where started_at >= $1 and started_at < $2`, [from, to]);

  const perDayRows = await query<{ day: string; in_hours: number; after_hours: number }>(
    `select to_char((started_at at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD') as day,
            count(*) filter (where in_hours)::int as in_hours,
            count(*) filter (where in_hours = false)::int as after_hours
     from calls where started_at >= $1 and started_at < $2 group by 1`, [from, to]);
  const byDay = new Map(perDayRows.map((x) => [x.day, x]));
  const perDay = daysIn(r).map((day) => ({ day, inHours: byDay.get(day)?.in_hours ?? 0, afterHours: byDay.get(day)?.after_hours ?? 0 }));

  const cat = await query<{ category: string | null; n: number }>(
    "select category, count(*)::int n from enquiries where created_at >= $1 and created_at < $2 group by category", [from, to]);
  const n = (k: string | null) => cat.find((x) => x.category === k)?.n ?? 0;

  const [h] = await query<{ sent: number; accepted: number; median: number | null }>(
    `select count(*)::int sent, count(accepted_at)::int accepted,
            percentile_cont(0.5) within group (order by extract(epoch from accepted_at - sent_at) / 60)::float as median
     from handoffs where sent_at >= $1 and sent_at < $2`, [from, to]);
  const [b] = await query<{ booked: number; cancelled: number }>(
    `select count(*) filter (where status = 'booked')::int booked, count(*) filter (where status = 'cancelled')::int cancelled
     from bookings where created_at >= $1 and created_at < $2`, [from, to]);
  const esc = await query<{ reason: string; total: number; open: number }>(
    `select reason, count(*)::int total, count(*) filter (where resolved_at is null)::int open
     from escalations where created_at >= $1 and created_at < $2 group by reason order by total desc`, [from, to]);

  const qualified = n("qualified");
  return {
    calls: { total: c.total, inHours: c.in_hours, afterHours: c.after_hours, completed: c.completed, dropped: c.dropped, missed: c.missed, transferred: c.transferred },
    perDay,
    outcomes: { qualified, notQualified: n("not_qualified"), unsure: n("unsure"), pending: n(null) },
    handoffs: { sent: h.sent, accepted: h.accepted, medianAcceptMinutes: h.median },
    bookings: { booked: b.booked, cancelled: b.cancelled },
    escalations: esc.map((e) => ({ reason: e.reason, total: e.total, open: e.open })),
    costs: await costSummary(r, qualified, b.booked, c.total),
  };
}

// ---------------------------------------------------------------------------- call list and detail
export interface CallRow {
  id: string; startedAt: Date; status: string; channel: string; inHours: boolean | null; durationSec: number | null;
  name: string | null; phone: string | null; category: string | null; score: number | null; state: string;
}

export interface CallFilter { status?: string; category?: string; q?: string; page?: number }
export const PAGE_SIZE = 25;

export async function callList(r: Range, f: CallFilter): Promise<{ rows: CallRow[]; total: number }> {
  const [from, to] = win(r);
  const params: unknown[] = [from, to];
  const where = ["c.started_at >= $1", "c.started_at < $2"];
  if (f.status) { params.push(f.status); where.push(`c.status = $${params.length}`); }
  if (f.category === "pending") where.push("e.category is null");
  else if (f.category) { params.push(f.category); where.push(`e.category = $${params.length}`); }
  if (f.q) { params.push(`%${f.q.toLowerCase()}%`); where.push(`(lower(coalesce(e.name, k.name, '')) like $${params.length} or k.phone like $${params.length})`); }
  const base = `from calls c left join callers k on k.id = c.caller_id left join enquiries e on e.id = c.enquiry_id where ${where.join(" and ")}`;
  const [{ n }] = await query<{ n: number }>(`select count(*)::int n ${base}`, params);
  const page = Math.max(1, f.page ?? 1);
  const rows = await query<{
    id: string; started_at: string; status: string; channel: string; in_hours: boolean | null; duration_sec: number | null;
    name: string | null; phone: string | null; category: string | null; score: number | null; processing_state: string;
  }>(
    `select c.id, c.started_at, c.status, c.channel, c.in_hours, c.duration_sec, coalesce(e.name, k.name) as name, k.phone,
            e.category, e.score, c.processing_state ${base} order by c.started_at desc limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`, params);
  return {
    total: n,
    rows: rows.map((x) => ({
      id: x.id, startedAt: new Date(x.started_at), status: x.status, channel: x.channel, inHours: x.in_hours, durationSec: x.duration_sec,
      name: x.name, phone: x.phone, category: x.category, score: x.score, state: x.processing_state,
    })),
  };
}

export interface CallDetail {
  call: Record<string, unknown>;
  enquiry: Record<string, unknown> | null;
  handoff: Record<string, unknown> | null;
  booking: Record<string, unknown> | null;
  escalations: Record<string, unknown>[];
  costs: { line: string; quantity: number; amount: number }[];
  hubspotContactId: string | null;
}

export async function callDetail(id: string): Promise<CallDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [call] = await query<Record<string, unknown>>(
    `select c.*, k.phone, k.name as caller_name, k.hubspot_contact_id from calls c left join callers k on k.id = c.caller_id where c.id = $1`, [id]);
  if (!call) return null;
  const enquiryId = call.enquiry_id as string | null;
  const [enquiry] = enquiryId ? await query<Record<string, unknown>>("select * from enquiries where id = $1", [enquiryId]) : [];
  const [handoff] = enquiryId ? await query<Record<string, unknown>>("select * from handoffs where enquiry_id = $1 order by sent_at desc limit 1", [enquiryId]) : [];
  const [booking] = enquiryId ? await query<Record<string, unknown>>("select * from bookings where enquiry_id = $1 order by created_at desc limit 1", [enquiryId]) : [];
  const escalations = await query<Record<string, unknown>>("select * from escalations where call_id = $1 order by created_at", [id]);
  const costs = await query<{ line: string; quantity: number; amount: number }>(
    "select line, sum(quantity)::float as quantity, sum(amount_inr)::float as amount from cost_events where call_id = $1 group by line order by line", [id]);
  return { call, enquiry: enquiry ?? null, handoff: handoff ?? null, booking: booking ?? null, escalations, costs, hubspotContactId: (call.hubspot_contact_id as string | null) ?? null };
}

// ---------------------------------------------------------------------------- follow-up lists
export interface Followups {
  linkNotBooked: { enquiryId: string; name: string | null; phone: string; createdAt: Date; started: boolean; linkSent: boolean }[];
  unaccepted: { handoffId: string; enquiryId: string; name: string | null; phone: string; sentAt: Date }[];
  openEscalations: { id: string; reason: string; urgent: boolean; name: string | null; phone: string | null; createdAt: Date; callId: string | null }[];
}

export async function followups(): Promise<Followups> {
  const links = await query<{ enquiry_id: string; name: string | null; phone: string; created_at: string; started_at: string | null; link_sent_at: string | null }>(
    `select l.enquiry_id, coalesce(e.name, k.name) as name, k.phone, l.created_at, l.started_at, l.link_sent_at
     from telegram_links l join enquiries e on e.id = l.enquiry_id join callers k on k.id = l.caller_id
     where not exists (select 1 from bookings b where b.enquiry_id = l.enquiry_id and b.status = 'booked')
     order by l.created_at desc limit 100`);
  const handoffs = await query<{ id: string; enquiry_id: string; name: string | null; phone: string; sent_at: string }>(
    `select h.id, h.enquiry_id, coalesce(e.name, k.name) as name, k.phone, h.sent_at
     from handoffs h join enquiries e on e.id = h.enquiry_id join callers k on k.id = e.caller_id
     where h.accepted_at is null order by h.sent_at limit 100`);
  const esc = await query<{ id: string; reason: string; urgent: boolean; name: string | null; phone: string | null; created_at: string; call_id: string | null }>(
    `select x.id, x.reason, x.urgent, coalesce(e.name, k.name) as name, k.phone, x.created_at, x.call_id
     from escalations x left join enquiries e on e.id = x.enquiry_id left join calls c on c.id = x.call_id left join callers k on k.id = coalesce(e.caller_id, c.caller_id)
     where x.resolved_at is null order by x.urgent desc, x.created_at limit 100`);
  return {
    linkNotBooked: links.map((l) => ({ enquiryId: l.enquiry_id, name: l.name, phone: l.phone, createdAt: new Date(l.created_at), started: !!l.started_at, linkSent: !!l.link_sent_at })),
    unaccepted: handoffs.map((h) => ({ handoffId: h.id, enquiryId: h.enquiry_id, name: h.name, phone: h.phone, sentAt: new Date(h.sent_at) })),
    openEscalations: esc.map((x) => ({ id: x.id, reason: x.reason, urgent: x.urgent, name: x.name, phone: x.phone, createdAt: new Date(x.created_at), callId: x.call_id })),
  };
}

export async function costsPerCall(r: Range): Promise<{ id: string; startedAt: Date; name: string | null; vaani: number; gemini: number; sms: number; total: number }[]> {
  const [from, to] = win(r);
  const rows = await query<{ id: string; started_at: string; name: string | null; vaani: number; gemini: number; sms: number }>(
    `select c.id, c.started_at, coalesce(e.name, k.name) as name,
            coalesce(sum(x.amount_inr) filter (where x.line = 'vaani_minutes'), 0)::float as vaani,
            coalesce(sum(x.amount_inr) filter (where x.line = 'gemini_tokens'), 0)::float as gemini,
            coalesce(sum(x.amount_inr) filter (where x.line = 'sms'), 0)::float as sms
     from calls c left join cost_events x on x.call_id = c.id left join callers k on k.id = c.caller_id left join enquiries e on e.id = c.enquiry_id
     where c.started_at >= $1 and c.started_at < $2 group by c.id, e.name, k.name order by c.started_at desc limit 200`, [from, to]);
  return rows.map((x) => ({ id: x.id, startedAt: new Date(x.started_at), name: x.name, vaani: x.vaani, gemini: x.gemini, sms: x.sms, total: x.vaani + x.gemini + x.sms }));
}
