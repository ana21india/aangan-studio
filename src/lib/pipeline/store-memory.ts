import { mergeConfig } from "../config-defaults";
import type { EnquiryResult, Store } from "./store";
import type { CallEndedEvent } from "../voice/types";

const cfg = mergeConfig({});

// In-memory stand-in for the database. Used by the unit tests and by the evaluation script (npm run eval).
export class MemoryStore implements Store {
  callers = new Map<string, string>();
  calls: { id: string; providerCallId: string; callerId: string; enquiryId?: string; transcript: string | null; startedAt: Date; state?: string }[] = [];
  enquiries: { id: string; callerId: string; result?: EnquiryResult }[] = [];
  escalations: { callId: string; enquiryId: string | null; reason: string; urgent: boolean; resolved?: boolean }[] = [];
  costs: unknown[] = [];
  handoffs = new Set<string>();

  async getConfig() { return cfg; }
  async getKnowledge() { return { services: "services", qualified: "rubric" }; }
  async upsertCaller(phone: string) {
    if (!this.callers.has(phone)) this.callers.set(phone, `caller-${this.callers.size + 1}`);
    return this.callers.get(phone)!;
  }
  async insertCall(e: CallEndedEvent, callerId: string) {
    if (this.calls.some((c) => c.providerCallId === e.providerCallId)) return null;
    const id = `call-row-${this.calls.length + 1}`;
    this.calls.push({ id, providerCallId: e.providerCallId, callerId, transcript: e.transcript, startedAt: e.startedAt });
    return id;
  }
  async findMergeableEnquiry(callerId: string, since: Date) {
    for (const q of this.enquiries.filter((x) => x.callerId === callerId)) {
      const last = Math.max(...this.calls.filter((c) => c.enquiryId === q.id).map((c) => c.startedAt.getTime()));
      if (last >= since.getTime()) return q.id;
    }
    return null;
  }
  async createEnquiry(callerId: string) {
    const id = `enq-${this.enquiries.length + 1}`;
    this.enquiries.push({ id, callerId });
    return id;
  }
  async linkCall(callId: string, enquiryId: string) { this.calls.find((c) => c.id === callId)!.enquiryId = enquiryId; }
  async transcriptsForEnquiry(enquiryId: string) {
    return this.calls.filter((c) => c.enquiryId === enquiryId).map((c) => c.transcript ?? "");
  }
  async saveEnquiryResult(enquiryId: string, _c: string, r: EnquiryResult) {
    this.enquiries.find((q) => q.id === enquiryId)!.result = r;
  }
  async setCallState(callId: string, state: "processed" | "failed") { this.calls.find((c) => c.id === callId)!.state = state; }
  async addEscalation(row: { callId: string; enquiryId: string | null; reason: string; urgent: boolean }) { this.escalations.push(row); }
  async resolveCallbackEscalations(enquiryId: string) {
    for (const e of this.escalations) {
      if (e.enquiryId === enquiryId && ["missed_call", "dropped_call"].includes(e.reason)) e.resolved = true;
    }
  }
  async hasHandoff(enquiryId: string) { return this.handoffs.has(enquiryId); }
  async addCosts(_c: string | null, rows: unknown[]) { this.costs.push(...rows); }
}
