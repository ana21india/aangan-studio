import { analyseTranscript, type Analysis, type KnowledgeDocs } from "../ai/analyse";
import type { AppConfig } from "../config-defaults";
import { deriveOutcome } from "../scoring/rules";
import type { ExtractedFields } from "../scoring/types";
import type { CallEndedEvent } from "../voice/types";
import { computeCosts, ratesFromEnv, type Rates } from "./cost";
import { buildHandoffNote } from "./handoff-note";
import { isInHours, maskPhone } from "./hours";
import type { PipelineResult, Store } from "./store";

export interface PipelineDeps {
  store: Store;
  analyse?: (transcript: string, callDate: Date, docs: KnowledgeDocs) => Promise<Analysis>;
  rates?: Rates;
  appBaseUrl?: string;
  // Milestone 3 plugs Telegram in here; Milestone 4 adds HubSpot and the Cal.com link.
  route?: (result: PipelineResult, ctx: { event: CallEndedEvent; callerPhone: string }) => Promise<void>;
}

const dealName = (f: ExtractedFields) =>
  [f.name ?? "Unknown caller", f.location ?? f.city, f.size_sqft ? `${f.size_sqft} sq ft` : null, f.scope?.replace("_", " ")]
    .filter(Boolean)
    .join(" · ");

const appBase = (override?: string) => override ?? process.env.APP_BASE_URL ?? "http://localhost:3000";

// Under this many characters there is nothing to judge, so we skip Gemini and ask the front desk to call back.
const MIN_TRANSCRIPT_CHARS = 120;

// Steps 2-7 of the post-call pipeline: dedupe, store, extract, score, route, log costs.
export async function processCallEnded(event: CallEndedEvent, deps: PipelineDeps): Promise<PipelineResult> {
  const { store } = deps;
  const analyse = deps.analyse ?? analyseTranscript;
  const rates = deps.rates ?? ratesFromEnv();
  const cfg: AppConfig = await store.getConfig();

  if (!event.callerPhone) {
    // Never guess a caller. Vaani's webhook has no number, so Milestone 6 must look it up by call id.
    throw new Error(`Call ${event.providerCallId} has no caller phone number`);
  }
  const phone = event.callerPhone;

  const callerId = await store.upsertCaller(phone, event.startedAt);
  const inHours = isInHours(event.startedAt, cfg.OFFICE_HOURS_START, cfg.OFFICE_HOURS_END);
  const callId = await store.insertCall(event, callerId, inHours);
  if (callId === null) return { duplicate: true }; // duplicate webhooks never create a second handoff

  // A routing failure (for example Telegram being down) must never lose the enquiry: it is already saved,
  // so we mark the call failed and rethrow. Milestone 7 adds retries and a last-resort alert.
  const runRoute = async (result: PipelineResult) => {
    await deps.route?.(result, { event, callerPhone: phone });
  };

  try {
    // Repeat calls from one number inside the merge window share one enquiry.
    const since = new Date(event.startedAt.getTime() - cfg.MERGE_WINDOW_MINUTES * 60_000);
    const enquiryId = (await store.findMergeableEnquiry(callerId, since)) ?? (await store.createEnquiry(callerId));
    await store.linkCall(callId, enquiryId);

    const transcripts = (await store.transcriptsForEnquiry(enquiryId)).filter(Boolean);
    const combined = transcripts.join("\n\n--- next call ---\n\n");

    if (event.status === "missed" || combined.length < MIN_TRANSCRIPT_CHARS) {
      const reason = event.status === "missed" ? "missed_call" : "dropped_call";
      await store.addEscalation({ callId, enquiryId, reason, urgent: false, routedTo: "frontdesk" });
      await store.addCosts(callId, computeCosts(event, null, rates));
      await store.setCallState(callId, "processed");
      const result: PipelineResult = {
        duplicate: false,
        callId,
        enquiryId,
        category: "unsure",
        escalation: { reason, urgent: false },
        skippedAnalysis: event.status === "missed" ? "missed" : "too_short",
        context: { callerId, name: null, reasons: [], summary: null, dealName: `Enquiry · ${maskPhone(phone)}`, transcriptUrl: `${appBase()}/dashboard/calls/${callId}`, usesTelegram: null },
      };
      await runRoute(result);
      return result;
    }

    const knowledge = await store.getKnowledge();
    const analysis = await analyse(combined, event.startedAt, knowledge);
    const outcome = deriveOutcome(analysis.fields, analysis.assessment, cfg);

    const base = appBase(deps.appBaseUrl);
    const handoffNote =
      outcome.category === "qualified"
        ? buildHandoffNote({ fields: analysis.fields, assessment: analysis.assessment, outcome, phone, transcriptUrl: `${base}/dashboard/calls/${callId}` })
        : null;

    await store.saveEnquiryResult(enquiryId, callerId, { fields: analysis.fields, assessment: analysis.assessment, outcome, handoffNote });

    if (outcome.escalation) {
      await store.addEscalation({
        callId,
        enquiryId,
        reason: outcome.escalation.reason,
        urgent: outcome.escalation.urgent,
        routedTo: "frontdesk",
      });
    } else {
      // Qualified or not qualified: a real outcome exists, so earlier "call back" alerts are done.
      await store.resolveCallbackEscalations(enquiryId);
    }

    await store.addCosts(callId, computeCosts(event, analysis.usage, rates));
    await store.setCallState(callId, "processed");

    const result: PipelineResult = {
      duplicate: false,
      callId,
      enquiryId,
      category: outcome.category,
      escalation: outcome.escalation,
      handoffNote,
      alreadyHandedOff: await store.hasHandoff(enquiryId),
      context: {
        callerId,
        name: analysis.fields.name,
        reasons: outcome.reasons,
        summary: analysis.fields.caller_asked_about,
        dealName: dealName(analysis.fields),
        transcriptUrl: `${base}/dashboard/calls/${callId}`,
        usesTelegram: analysis.assessment.uses_telegram,
      },
    };
    await runRoute(result);
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await store.setCallState(callId, "failed", message).catch(() => {});
    console.error(`pipeline failed for call ${event.providerCallId} (${maskPhone(phone)}): ${message}`);
    throw e;
  }
}
