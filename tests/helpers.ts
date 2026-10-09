import { mergeConfig } from "../src/lib/config-defaults";
import type { Analysis } from "../src/lib/ai/analyse";
import type { Assessment, ExtractedFields } from "../src/lib/scoring/types";
import type { CallEndedEvent } from "../src/lib/voice/types";
export { MemoryStore } from "../src/lib/pipeline/store-memory";

export const cfg = mergeConfig({});

export const emptyFields: ExtractedFields = {
  name: null, space_type: null, size_sqft: null, location: null, city: null, scope: null,
  timeline_text: null, handover_date: null, weeks_until_needed: null, budget_text: null,
  budget_inr_low: null, budget_inr_high: null, source: null, decision_maker_note: null, caller_asked_about: null,
};

const pass = (reason = "ok") => ({ status: "pass" as const, reason });

export const goodAssessment: Assessment = {
  real_project: pass(), service_area: pass(), timeline: pass(), decision_maker: pass(),
  complaint_or_existing_client_issue: false, asked_for_person: false, uses_telegram: null,
  score: 8, confidence: "high", why_qualified: "Full home in Kothrud, owner on the call.",
};

export function analysis(fields: Partial<ExtractedFields> = {}, a: Partial<Assessment> = {}): Analysis {
  return {
    fields: { ...emptyFields, name: "Priya", space_type: "home", size_sqft: 1400, scope: "full_interior", ...fields },
    assessment: { ...goodAssessment, ...a },
    usage: { inputTokens: 2000, outputTokens: 300 },
  };
}

export function event(over: Partial<CallEndedEvent> = {}): CallEndedEvent {
  return {
    providerCallId: "call-1", channel: "phone", callerPhone: "+919000000001",
    startedAt: new Date("2026-09-02T04:53:00Z"), endedAt: null, durationSec: 252, status: "completed",
    transcript: "Caller: ".padEnd(200, "x"), recordingUrl: null, providerCostInr: null, ...over,
  };
}

