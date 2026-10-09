// Everything downstream of the webhook works on this shape and knows nothing about Vaani.
// A new channel (WhatsApp, web form) enters the same way, with `channel` set. See docs/extending.md.
export type Channel = "phone" | "whatsapp" | "web";
export type CallStatus = "completed" | "dropped" | "missed" | "transferred";

export interface CallEndedEvent {
  providerCallId: string;
  channel: Channel;
  callerPhone: string | null; // E.164
  startedAt: Date;
  endedAt: Date | null;
  durationSec: number | null;
  status: CallStatus;
  transcript: string | null;
  recordingUrl: string | null;
  providerCostInr: number | null;
}

export interface VoiceProvider {
  readonly name: string;
  /** True only if the request carries a valid signature for this exact raw body. */
  verifyWebhook(rawBody: string, headers: Headers): boolean;
  parseCallEnded(rawBody: string): CallEndedEvent;
}
