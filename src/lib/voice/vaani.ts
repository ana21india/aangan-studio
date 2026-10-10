import { createHash, timingSafeEqual } from "node:crypto";
import type { CallEndedEvent, CallStatus } from "./types";

// Real Vaani (vaanivoice.ai) events, as documented at docs.vaanivoice.ai/guides/webhook-setup. Field names are
// confirmed against the first live test call in Milestone 6.
//   call_started               {event, room_name, status, phone_number}          the caller's number is here
//   human_transfer_*           {event, room_name, transfer_type, phone_number, ...}
//   call_ended                 {event, room_name, call_duration (seconds), end_reason}
//   call_postprocessing        {event, call_id, timestamp, data:{room_name, call_id, call_duration (ms),
//                               end_reason, summary, entities, dispositions, recording_url, transcript}}
// Vaani does not sign these requests, so our webhook address carries a secret token that we check instead.

export interface VaaniSession {
  roomName: string;
  phone: string | null;
  startedAt: Date | null;
  transferStatus: "initiated" | "successful" | "failed" | null;
}

export interface VaaniSessionStore {
  upsertStarted(roomName: string, phone: string | null, at: Date): Promise<void>;
  markTransfer(roomName: string, status: "initiated" | "successful" | "failed", type: string | null, phone: string | null): Promise<void>;
  get(roomName: string): Promise<VaaniSession | null>;
}

export function verifyToken(received: string | null, secret = process.env.VAANI_WEBHOOK_SECRET): boolean {
  if (!secret || !received) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function normalisePhoneNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.length === 10 ? `+91${digits}` : `+${digits}`;
}

// Vaani labels turns "AGENT:" and "USER:". The caller is the USER.
function transcriptText(t: unknown): string | null {
  if (typeof t === "string") return t.trim() || null;
  if (Array.isArray(t)) {
    const lines = t.map((x: { role?: string; speaker?: string; text?: string; content?: string }) =>
      `${(x.role ?? x.speaker ?? "").toUpperCase()}: ${x.text ?? x.content ?? ""}`.trim());
    return lines.join("\n\n").trim() || null;
  }
  return null;
}

export interface VaaniBody {
  event?: string;
  type?: string;
  room_name?: string;
  phone_number?: string;
  transfer_type?: string;
  call_duration?: number;
  end_reason?: string;
  call_id?: string;
  timestamp?: string | number;
  data?: {
    room_name?: string;
    call_id?: string;
    call_duration?: number;
    end_reason?: string;
    summary?: string;
    recording_url?: string;
    transcript?: unknown;
  };
}

const MIN_TRANSCRIPT_CHARS = 120;

// A web (browser) test call has no phone number. When the owner switches on ALLOW_UNKNOWN_CALLERS (demo mode),
// such a call gets a stable made-up number. It starts with 5, which no Indian mobile does, so it can never
// reach a real person. Off by default: real calls without a number are refused (DECISIONS.md D-056).
export function syntheticPhone(roomName: string): string {
  const n = parseInt(createHash("sha256").update(roomName).digest("hex").slice(0, 8), 16) % 1_000_000;
  return `+915000${String(n).padStart(6, "0")}`;
}

export interface VaaniDeps {
  allowUnknownCaller?: boolean;
  sessions: VaaniSessionStore;
  process: (event: CallEndedEvent) => Promise<unknown>;
  now?: () => Date;
}

export async function handleVaaniWebhook(body: VaaniBody, deps: VaaniDeps): Promise<{ handled: string }> {
  const { sessions } = deps;
  const now = (deps.now ?? (() => new Date()))();
  const name = body.event ?? body.type ?? "";

  if (name === "call_started" && body.room_name) {
    await sessions.upsertStarted(body.room_name, normalisePhoneNumber(body.phone_number), now);
    return { handled: name };
  }

  if (name.startsWith("human_transfer_") && body.room_name) {
    const status = name.replace("human_transfer_", "") as "initiated" | "successful" | "failed";
    if (["initiated", "successful", "failed"].includes(status)) {
      await sessions.markTransfer(body.room_name, status, body.transfer_type ?? null, normalisePhoneNumber(body.phone_number));
    }
    return { handled: name };
  }

  if (name === "call_postprocessing" && body.data) {
    const d = body.data;
    const room = d.room_name ?? body.room_name;
    const session = room ? await sessions.get(room) : null;
    const transcript = transcriptText(d.transcript);
    const durationSec = typeof d.call_duration === "number" ? Math.round(d.call_duration / 1000) : null;

    const ts = body.timestamp != null ? new Date(body.timestamp) : now;
    const endedAt = Number.isNaN(ts.getTime()) ? now : ts;
    const startedAt = session?.startedAt ?? (durationSec != null ? new Date(endedAt.getTime() - durationSec * 1000) : endedAt);

    let status: CallStatus = "completed";
    if (session?.transferStatus === "successful") status = "transferred";
    else if (!transcript || transcript.length < MIN_TRANSCRIPT_CHARS) status = "dropped";

    await deps.process({
      providerCallId: d.call_id ?? body.call_id ?? room ?? `vaani-${now.getTime()}`,
      channel: "phone",
      callerPhone: session?.phone ?? (deps.allowUnknownCaller && room ? syntheticPhone(room) : null),
      startedAt,
      endedAt,
      durationSec,
      status,
      transcript,
      recordingUrl: d.recording_url ?? null,
      providerCostInr: null,
    });
    return { handled: name };
  }

  // call_ended, user_picked_up_at, and so on carry nothing we need: the postprocessing event has the full record.
  return { handled: `ignored:${name || "unknown"}` };
}
