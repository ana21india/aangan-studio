import type { AppConfig } from "../config-defaults";
import type { KnowledgeDocs } from "../ai/analyse";
import type { CallEndedEvent } from "../voice/types";
import type { Assessment, Category, ExtractedFields, Outcome } from "../scoring/types";
import type { CostRow } from "./cost";

export interface EnquiryResult {
  fields: ExtractedFields;
  assessment: Assessment;
  outcome: Outcome;
  handoffNote: string | null;
}

// The pipeline talks to storage only through this interface, so tests can run without a database.
export interface Store {
  getConfig(): Promise<AppConfig>;
  getKnowledge(): Promise<KnowledgeDocs>;
  /** Atomic: returns null when provider_call_id already exists (duplicate webhook). */
  insertCall(event: CallEndedEvent, callerId: string, inHours: boolean): Promise<string | null>;
  upsertCaller(phone: string, seenAt: Date): Promise<string>;
  findMergeableEnquiry(callerId: string, since: Date): Promise<string | null>;
  createEnquiry(callerId: string): Promise<string>;
  linkCall(callId: string, enquiryId: string): Promise<void>;
  transcriptsForEnquiry(enquiryId: string): Promise<string[]>;
  saveEnquiryResult(enquiryId: string, callerId: string, result: EnquiryResult): Promise<void>;
  setCallState(callId: string, state: "processed" | "failed", error?: string): Promise<void>;
  addEscalation(row: { callId: string; enquiryId: string | null; reason: string; urgent: boolean; routedTo: string }): Promise<void>;
  /** Cancels open callback alerts (missed or dropped call) once a real outcome exists. */
  resolveCallbackEscalations(enquiryId: string): Promise<void>;
  hasHandoff(enquiryId: string): Promise<boolean>;
  addCosts(callId: string | null, rows: CostRow[]): Promise<void>;
}

export interface PipelineResult {
  duplicate: boolean;
  callId?: string;
  enquiryId?: string;
  category?: Category;
  escalation?: { reason: string; urgent: boolean } | null;
  handoffNote?: string | null;
  alreadyHandedOff?: boolean;
  skippedAnalysis?: "missed" | "too_short";
  context?: {
    callerId: string;
    name: string | null;
    reasons: string[];
    summary: string | null;
    transcriptUrl: string;
    usesTelegram: boolean | null;
  };
}
