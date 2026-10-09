import { mergeConfig, type AppConfig } from "../config-defaults";
import { query } from "../db";
import type { CallEndedEvent } from "../voice/types";
import type { CostRow } from "./cost";
import type { EnquiryResult, Store } from "./store";

export class PgStore implements Store {
  async getConfig(): Promise<AppConfig> {
    const rows = await query<{ key: string; value: unknown }>("select key, value from config");
    return mergeConfig(Object.fromEntries(rows.map((r) => [r.key, r.value])));
  }

  async getKnowledge() {
    const rows = await query<{ name: string; content: string }>(
      "select name, content from knowledge_docs where name in ('services.md','qualified.md')",
    );
    const by = Object.fromEntries(rows.map((r) => [r.name, r.content]));
    if (!by["services.md"] || !by["qualified.md"]) throw new Error("Knowledge docs missing: run npm run seed:knowledge");
    return { services: by["services.md"], qualified: by["qualified.md"] };
  }

  async upsertCaller(phone: string, seenAt: Date): Promise<string> {
    const rows = await query<{ id: string }>(
      `insert into callers (phone, first_seen, last_seen) values ($1, $2, $2)
       on conflict (phone) do update set last_seen = greatest(callers.last_seen, excluded.last_seen)
       returning id`,
      [phone, seenAt.toISOString()],
    );
    return rows[0].id;
  }

  async insertCall(e: CallEndedEvent, callerId: string, inHours: boolean): Promise<string | null> {
    const rows = await query<{ id: string }>(
      `insert into calls (caller_id, provider_call_id, channel, started_at, ended_at, duration_sec, in_hours,
                          transcript, recording_url, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       on conflict (provider_call_id) do nothing
       returning id`,
      [callerId, e.providerCallId, e.channel, e.startedAt.toISOString(), e.endedAt?.toISOString() ?? null,
        e.durationSec, inHours, e.transcript, e.recordingUrl, e.status],
    );
    return rows[0]?.id ?? null;
  }

  async findMergeableEnquiry(callerId: string, since: Date): Promise<string | null> {
    const rows = await query<{ id: string }>(
      `select e.id from enquiries e join calls c on c.enquiry_id = e.id
       where e.caller_id = $1
       group by e.id having max(c.started_at) >= $2
       order by max(c.started_at) desc limit 1`,
      [callerId, since.toISOString()],
    );
    return rows[0]?.id ?? null;
  }

  async createEnquiry(callerId: string): Promise<string> {
    const rows = await query<{ id: string }>("insert into enquiries (caller_id) values ($1) returning id", [callerId]);
    return rows[0].id;
  }

  async linkCall(callId: string, enquiryId: string) {
    await query("update calls set enquiry_id = $2 where id = $1", [callId, enquiryId]);
  }

  async transcriptsForEnquiry(enquiryId: string): Promise<string[]> {
    const rows = await query<{ transcript: string | null }>(
      "select transcript from calls where enquiry_id = $1 order by started_at",
      [enquiryId],
    );
    return rows.map((r) => r.transcript ?? "");
  }

  async saveEnquiryResult(enquiryId: string, callerId: string, r: EnquiryResult) {
    const f = r.fields;
    const resolved = r.outcome.category !== "unsure";
    await query(
      `update enquiries set name=$2, space_type=$3, size_sqft=$4, location=$5, city=$6, scope=$7,
         timeline_text=$8, handover_date=$9, budget_text=$10, budget_inr_low=$11, budget_inr_high=$12,
         source=$13, decision_maker_note=$14, caller_asked_about=$15, criteria=$16, score=$17,
         category=$18, reasons=$19, low_confidence=$20, handoff_note=$21, status=$22, updated_at=now()
       where id = $1`,
      [enquiryId, f.name, f.space_type, f.size_sqft != null ? Math.round(f.size_sqft) : null, f.location, f.city, f.scope,
        f.timeline_text, f.handover_date, f.budget_text, f.budget_inr_low, f.budget_inr_high,
        f.source, f.decision_maker_note, f.caller_asked_about,
        JSON.stringify(r.outcome.criteria), Math.round(r.assessment.score), r.outcome.category,
        JSON.stringify({ lines: r.outcome.reasons, notes: r.outcome.notes }),
        r.assessment.confidence === "low", r.handoffNote, resolved ? "resolved" : "open"],
    );
    if (f.name) await query("update callers set name = coalesce(name, $2) where id = $1", [callerId, f.name]);
  }

  async setCallState(callId: string, state: "processed" | "failed", error?: string) {
    await query("update calls set processing_state=$2, processing_error=$3 where id=$1", [callId, state, error ?? null]);
  }

  async addEscalation(row: { callId: string; enquiryId: string | null; reason: string; urgent: boolean; routedTo: string }) {
    await query(
      "insert into escalations (call_id, enquiry_id, reason, urgent, routed_to) values ($1,$2,$3,$4,$5)",
      [row.callId, row.enquiryId, row.reason, row.urgent, row.routedTo],
    );
  }

  async resolveCallbackEscalations(enquiryId: string) {
    await query(
      `update escalations set resolved_at = now()
       where enquiry_id = $1 and resolved_at is null and reason in ('missed_call','dropped_call')`,
      [enquiryId],
    );
  }

  async hasHandoff(enquiryId: string): Promise<boolean> {
    const rows = await query("select 1 from handoffs where enquiry_id = $1 limit 1", [enquiryId]);
    return rows.length > 0;
  }

  async addCosts(callId: string | null, rows: CostRow[]) {
    for (const r of rows) {
      await query(
        "insert into cost_events (call_id, line, quantity, unit_cost_inr, amount_inr) values ($1,$2,$3,$4,$5)",
        [callId, r.line, r.quantity, r.unit_cost_inr, r.amount_inr],
      );
    }
  }
}
