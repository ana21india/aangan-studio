import { MockVoiceProvider } from "./mock";
import { VaaniProvider } from "./vaani";
import type { VoiceProvider } from "./types";

// VOICE_PROVIDER=mock (default until Milestone 6) | vaani
export function getVoiceProvider(): VoiceProvider {
  return process.env.VOICE_PROVIDER === "vaani" ? new VaaniProvider() : new MockVoiceProvider();
}

export type { CallEndedEvent, VoiceProvider } from "./types";
