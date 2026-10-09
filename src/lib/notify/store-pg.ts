import { query } from "../db";
import type {
  BookingRecord, CallerCrm, AcceptResult, DueLink, EnquiryContext, LinkRow, NotifyStore, OverdueHandoff, StaleEscalation,
} from "./store";

type LinkSql = {
  id: string; enquiry_id: string; caller_id: string; start_token: string; telegram_chat_id: string | null;
  link_sent_at: string | null; created_at: string; name: string | null; phone: string;
};

const mapLink = (r: LinkSql): DueLink => ({
  id: r.id, enquiryId: r.enquiry_id, callerId: r.caller_id, token: r.start_token,
  chatId: r.telegram_chat_id ? Number(r.telegram_chat_id) : null,
  linkSentAt: r.link_sent_at ? new Date(r.link_sent_at) : null,
  name: r.name, phone: r.phone, createdAt: new Date(r.created_at),
});

const LINK_SELECT = `select l.id, l.enquiry_id, l.caller_id, l.start_token, l.telegram_chat_id, l.link_sent_at, l.created_at,
                            coalesce(e.name, c.name) as name, c.phone
                     from telegram_links l
                     join enquiries e on e.id = l.enquiry_id
                     join callers c on c.id = l.caller_id`;

export class PgNotifyStore implements NotifyStore {
  async getEnquiryContext(enquiryId: string): Promise<EnquiryContext | null> {
    const r = await query<{ id: string; caller_id: string; phone: string; name: string | null }>(
      `select e.id, e.caller_id, c.phone, coalesce(e.name, c.name) as name
       from enquiries e join callers c on c.id = e.caller_id where e.id = $1`, [enquiryId]);
    return r[0] ? { enquiryId: r[0].id, callerId: r[0].caller_id, phone: r[0].phone, name: r[0].name } : null;
  }

  async createHandoff(enquiryId: string): Promise<string> {
    const r = await query<{ id: string }>("insert into handoffs (enquiry_id) values ($1) returning id", [enquiryId]);
    return r[0].id;
  }

  async setHandoffMessage(handoffId: string, messageId: number) {
    await query("update handoffs set telegram_message_id = $2 where id = $1", [handoffId, messageId]);
  }

  async acceptHandoff(handoffId: string, by: string, telegramUserId: number): Promise<AcceptResult> {
    // Atomic: only the first tap wins.
    const won = await query(
      `update handoffs set accepted_by = $2, accepted_by_telegram_id = $3, accepted_at = now()
       where id = $1 and accepted_at is null returning id`, [handoffId, by, telegramUserId]);
    if (won.length) return { accepted: true };
    const cur = await query<{ accepted_by: string | null }>("select accepted_by from handoffs where id = $1", [handoffId]);
    return { accepted: false, by: cur[0]?.accepted_by ?? null };
  }

  async createTelegramLink(a: { enquiryId: string; callerId: string; token: string; nudgeDueAt: Date | null; morningDueAt: Date }) {
    await query(
      `insert into telegram_links (enquiry_id, caller_id, start_token, nudge_due_at, morning_due_at)
       values ($1,$2,$3,$4,$5)`,
      [a.enquiryId, a.callerId, a.token, a.nudgeDueAt?.toISOString() ?? null, a.morningDueAt.toISOString()]);
  }

  async findLinkByToken(token: string): Promise<LinkRow | null> {
    const r = await query<LinkSql>(`${LINK_SELECT} where l.start_token = $1`, [token]);
    return r[0] ? mapLink(r[0]) : null;
  }

  async findLatestQualifiedByPhone(phone: string, since: Date) {
    const r = await query<{ id: string; caller_id: string; phone: string; name: string | null; link_id: string | null }>(
      `select e.id, e.caller_id, c.phone, coalesce(e.name, c.name) as name,
              (select l.id from telegram_links l where l.enquiry_id = e.id order by l.created_at desc limit 1) as link_id
       from enquiries e join callers c on c.id = e.caller_id
       where c.phone = $1 and e.category = 'qualified' and e.created_at >= $2
       order by e.created_at desc limit 1`, [phone, since.toISOString()]);
    return r[0] ? { enquiryId: r[0].id, callerId: r[0].caller_id, phone: r[0].phone, name: r[0].name, linkId: r[0].link_id } : null;
  }

  async markLinkStarted(linkId: string, chatId: number) {
    await query("update telegram_links set telegram_chat_id = $2, started_at = coalesce(started_at, now()) where id = $1", [linkId, chatId]);
  }

  async markLinkSent(linkId: string, enquiryId: string) {
    await query("update telegram_links set link_sent_at = now() where id = $1", [linkId]);
    await query("update enquiries set booking_link_sent_at = now() where id = $1", [enquiryId]);
  }

  async dueNudges(now: Date): Promise<DueLink[]> {
    const r = await query<LinkSql>(
      `${LINK_SELECT} where l.started_at is null and l.link_sent_at is null and l.nudge_sent_at is null and l.nudge_due_at <= $1
       and not exists (select 1 from bookings b where b.enquiry_id = l.enquiry_id)`, [now.toISOString()]);
    return r.map(mapLink);
  }

  async markNudged(linkId: string) {
    await query("update telegram_links set nudge_sent_at = now() where id = $1", [linkId]);
  }

  async dueMorning(now: Date): Promise<DueLink[]> {
    const r = await query<LinkSql>(
      `${LINK_SELECT} where l.morning_sent_at is null and l.morning_due_at <= $1
       and not exists (select 1 from bookings b where b.enquiry_id = l.enquiry_id)`, [now.toISOString()]);
    return r.map(mapLink);
  }

  async markMorningSent(linkId: string) {
    await query("update telegram_links set morning_sent_at = now() where id = $1", [linkId]);
  }

  async overdueHandoffs(cutoff: Date): Promise<OverdueHandoff[]> {
    const r = await query<{ id: string; enquiry_id: string; name: string | null; phone: string; sent_at: string; telegram_message_id: string | null }>(
      `select h.id, h.enquiry_id, coalesce(e.name, c.name) as name, c.phone, h.sent_at, h.telegram_message_id
       from handoffs h join enquiries e on e.id = h.enquiry_id join callers c on c.id = e.caller_id
       where h.accepted_at is null and h.overdue_alerted_at is null and h.sent_at <= $1`, [cutoff.toISOString()]);
    return r.map((x) => ({ id: x.id, enquiryId: x.enquiry_id, name: x.name, phone: x.phone, sentAt: new Date(x.sent_at), messageId: x.telegram_message_id ? Number(x.telegram_message_id) : null }));
  }

  async markOverdueAlerted(handoffId: string) {
    await query("update handoffs set overdue_alerted_at = now() where id = $1", [handoffId]);
  }

  async staleEscalations(cutoff: Date): Promise<StaleEscalation[]> {
    const r = await query<{ id: string; reason: string; enquiry_id: string | null; name: string | null; phone: string | null; created_at: string }>(
      `select x.id, x.reason, x.enquiry_id, coalesce(e.name, c.name) as name, c.phone, x.created_at
       from escalations x left join enquiries e on e.id = x.enquiry_id left join callers c on c.id = e.caller_id
       where x.resolved_at is null and x.last_alerted_at is null and x.created_at <= $1
         and x.reason in ('missed_call','dropped_call')`, [cutoff.toISOString()]);
    return r.map((x) => ({ id: x.id, reason: x.reason, enquiryId: x.enquiry_id, name: x.name, phone: x.phone, createdAt: new Date(x.created_at) }));
  }

  async markEscalationRealerted(id: string) {
    await query("update escalations set last_alerted_at = now() where id = $1", [id]);
  }

  async getCallerCrm(callerId: string): Promise<CallerCrm | null> {
    const r = await query<{ id: string; name: string | null; phone: string; hubspot_contact_id: string | null }>(
      "select id, name, phone, hubspot_contact_id from callers where id = $1", [callerId]);
    return r[0] ? { callerId: r[0].id, name: r[0].name, phone: r[0].phone, hubspotContactId: r[0].hubspot_contact_id } : null;
  }

  async setCallerContact(callerId: string, hubspotContactId: string) {
    await query("update callers set hubspot_contact_id = $2 where id = $1", [callerId, hubspotContactId]);
  }

  async getEnquiryDeal(enquiryId: string): Promise<string | null> {
    const r = await query<{ hubspot_deal_id: string | null }>("select hubspot_deal_id from enquiries where id = $1", [enquiryId]);
    return r[0]?.hubspot_deal_id ?? null;
  }

  async setEnquiryDeal(enquiryId: string, dealId: string) {
    await query("update enquiries set hubspot_deal_id = $2 where id = $1", [enquiryId, dealId]);
  }

  async findLatestQualifiedByPhoneForBooking(phone: string, since: Date) {
    const r = await query<{ id: string; caller_id: string; phone: string; name: string | null; hubspot_deal_id: string | null }>(
      `select e.id, e.caller_id, c.phone, coalesce(e.name, c.name) as name, e.hubspot_deal_id
       from enquiries e join callers c on c.id = e.caller_id
       where c.phone = $1 and e.category = 'qualified' and e.created_at >= $2
       order by e.created_at desc limit 1`, [phone, since.toISOString()]);
    return r[0] ? { enquiryId: r[0].id, callerId: r[0].caller_id, phone: r[0].phone, name: r[0].name, dealId: r[0].hubspot_deal_id } : null;
  }

  async upsertBooking(b: BookingRecord) {
    await query(
      `insert into bookings (enquiry_id, cal_booking_id, scheduled_for, status, attendee_name, attendee_phone, cancelled_at)
       values ($1,$2,$3,$4,$5,$6, case when $4 = 'cancelled' then now() end)
       on conflict (cal_booking_id) do update
         set scheduled_for = excluded.scheduled_for, status = excluded.status,
             enquiry_id = coalesce(bookings.enquiry_id, excluded.enquiry_id),
             cancelled_at = case when excluded.status = 'cancelled' then now() else null end,
             updated_at = now()`,
      [b.enquiryId, b.calBookingId, b.scheduledFor?.toISOString() ?? null, b.status, b.attendeeName, b.attendeePhone]);
  }
}
