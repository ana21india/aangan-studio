import { verifySignature } from "./signature";
import type { CallEndedEvent, VoiceProvider } from "./types";

// Real Vaani provider (vaanivoice.ai). UNVERIFIED until Milestone 6: the field names below come from
// the public docs (docs/research-vaanivoice.md) and must be confirmed with a real test call.
// Known gaps: the call_postprocessing payload has no caller number or cost, so Milestone 6 adds a
// lookup against GET /api/call-history using call_id. Until then callerPhone stays null and the
// pipeline refuses the call loudly instead of guessing.
export class VaaniProvider implements VoiceProvider {
  readonly name = "vaani";

  verifyWebhook(rawBody: string, headers: Headers): boolean {
    // Dashboard webhook signing is undocumented; campaign webhooks use HMAC-SHA256 in X-Vaani-Signature.
    return verifySignature(process.env.VAANI_WEBHOOK_SECRET, rawBody, headers.get("x-vaani-signature"));
  }

  parseCallEnded(rawBody: string): CallEndedEvent {
    const b = JSON.parse(rawBody);
    const d = b.data ?? {};
    const started = new Date(b.timestamp ?? Date.now());
    const durationSec = typeof d.call_duration === "number" ? Math.round(d.call_duration / 1000) : null;
    return {
      providerCallId: String(b.call_id),
      channel: "phone",
      callerPhone: null,
      startedAt: started,
      endedAt: durationSec != null ? new Date(started.getTime() + durationSec * 1000) : null,
      durationSec,
      status: d.end_reason === "transferred" ? "transferred" : "completed",
      transcript: typeof d.transcript === "string" ? d.transcript : JSON.stringify(d.transcript ?? null),
      recordingUrl: d.recording_url ?? null,
      providerCostInr: null,
    };
  }
}
