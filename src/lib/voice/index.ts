import { MockVoiceProvider } from "./mock";
import type { VoiceProvider } from "./types";

// /api/webhooks/vaani/call-ended accepts normalised, signed call records (the mock provider and any future text
// channel). Real Vaani events arrive at /api/webhooks/vaani/events and are handled in ./vaani.ts.
export function getVoiceProvider(): VoiceProvider {
  return new MockVoiceProvider();
}

export type { CallEndedEvent, VoiceProvider } from "./types";
