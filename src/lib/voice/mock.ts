import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { verifySignature } from "./signature";
import type { CallEndedEvent, Channel, VoiceProvider } from "./types";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const YEAR = 2026;

export interface MockEnquiry {
  id: string;
  hiddenNote: string | null; // front-desk notes stripped from the transcript (DECISIONS.md D-016)
  events: CallEndedEvent[];
}

function istDate(day: number, month: number, hour: number, minute: number): Date {
  const p = (n: number) => String(n).padStart(2, "0");
  return new Date(`${YEAR}-${p(month + 1)}-${p(day)}T${p(hour)}:${p(minute)}:00+05:30`);
}

function parseDayMonth(header: string): { day: number; month: number } {
  const m = header.match(new RegExp(`(\\d{1,2})(?:\\s*[–-]\\s*\\d{1,2})?\\s+(${MONTHS.join("|")})`));
  if (!m) throw new Error(`No date in header: ${header}`);
  return { day: Number(m[1]), month: MONTHS.indexOf(m[2]) };
}

function parseTimes(header: string): { hour: number; minute: number }[] {
  return [...header.matchAll(/(\d{1,2}):(\d{2})\s*(am|pm)/gi)].map((m) => {
    let hour = Number(m[1]) % 12;
    if (m[3].toLowerCase() === "pm") hour += 12;
    return { hour, minute: Number(m[2]) };
  });
}

function parseDuration(text: string): number | null {
  const m = text.match(/(\d+)\s*min(?:\s*(\d+)\s*sec)?/i);
  if (m) return Number(m[1]) * 60 + Number(m[2] ?? 0);
  const s = text.match(/(\d+)\s*sec/i);
  return s ? Number(s[1]) : null;
}

// Synthetic caller numbers, one per test enquiry. They start with 5, which is not a valid Indian mobile prefix,
// so they cannot belong to a real person.
function fakePhone(id: string): string {
  const n = Number(id.slice(1)) + (id[0] === "W" ? 20 : id[0] === "F" ? 30 : 0);
  return `+91500000${String(n).padStart(4, "0")}`;
}

export function parseEnquiryFile(text: string): MockEnquiry {
  const id = text.match(/^id: (\w+)/m)![1];
  const channel = text.match(/^channel: (\w+)/m)![1] as Channel;
  const header = text.match(/^header: (.*)$/m)![1];
  const rawBody = text.split(/^---\s*$/m)[1].trim();

  // Drop front-desk "Note:" / "Status:" lines: they give the answer away.
  const kept: string[] = [];
  const hidden: string[] = [];
  for (const line of rawBody.split("\n")) {
    (/^(Note|Status):/.test(line.trim()) ? hidden : kept).push(line);
  }
  const body = kept.join("\n").trim();
  const hiddenNote = hidden.length ? hidden.join(" ").trim() : null;

  const { day, month } = parseDayMonth(header);
  const times = parseTimes(header);
  const phone = fakePhone(id);
  const base = { channel, callerPhone: phone, recordingUrl: null, providerCostInr: null };

  if (/MISSED CALL/i.test(header)) {
    const t = times[0] ?? { hour: 22, minute: 47 };
    const at = istDate(day, month, t.hour, t.minute);
    return {
      id,
      hiddenNote: body,
      events: [{ ...base, providerCallId: `mock-${id}`, startedAt: at, endedAt: at, durationSec: 0, status: "missed", transcript: null }],
    };
  }

  // Two calls in one record (dropped call, then the retry).
  const parts = body.split(/^(?=First call|Second call)/m).filter((p) => /^(First|Second) call/.test(p));
  if (parts.length === 2) {
    return {
      id,
      hiddenNote,
      events: parts.map((p, i) => {
        const t = times[i] ?? times[0];
        const startedAt = istDate(day, month, t.hour, t.minute);
        const durationSec = parseDuration(p.split("\n")[0]);
        const text = p.split("\n").slice(1).join("\n").trim();
        return {
          ...base,
          providerCallId: `mock-${id}-${i + 1}`,
          startedAt,
          endedAt: durationSec ? new Date(startedAt.getTime() + durationSec * 1000) : null,
          durationSec,
          status: /disconnected|line drops/i.test(p) ? "dropped" : "completed",
          transcript: text,
        } as CallEndedEvent;
      }),
    };
  }

  const t = times[0] ?? { hour: 10, minute: 0 };
  const startedAt = istDate(day, month, t.hour, t.minute);
  const durationSec = channel === "phone" ? parseDuration(header) : null;
  return {
    id,
    hiddenNote,
    events: [
      {
        ...base,
        providerCallId: `mock-${id}`,
        startedAt,
        endedAt: durationSec ? new Date(startedAt.getTime() + durationSec * 1000) : null,
        durationSec,
        status: "completed",
        transcript: body,
      },
    ],
  };
}

// Replays the text transcripts in data/enquiries as if they were finished calls.
export class MockVoiceProvider implements VoiceProvider {
  readonly name = "mock";

  constructor(private readonly dir = join(process.cwd(), "data", "enquiries")) {}

  replay(): MockEnquiry[] {
    return readdirSync(this.dir)
      .filter((f) => /^[TWF]\d+\.txt$/.test(f))
      .sort()
      .map((f) => parseEnquiryFile(readFileSync(join(this.dir, f), "utf-8")));
  }

  verifyWebhook(rawBody: string, headers: Headers): boolean {
    return verifySignature(process.env.VAANI_WEBHOOK_SECRET, rawBody, headers.get("x-vaani-signature"));
  }

  parseCallEnded(rawBody: string): CallEndedEvent {
    return reviveEvent(JSON.parse(rawBody));
  }
}

export function reviveEvent(o: Record<string, unknown>): CallEndedEvent {
  return {
    providerCallId: String(o.providerCallId),
    channel: (o.channel as Channel) ?? "phone",
    callerPhone: (o.callerPhone as string | null) ?? null,
    startedAt: new Date(o.startedAt as string),
    endedAt: o.endedAt ? new Date(o.endedAt as string) : null,
    durationSec: (o.durationSec as number | null) ?? null,
    status: o.status as CallEndedEvent["status"],
    transcript: (o.transcript as string | null) ?? null,
    recordingUrl: (o.recordingUrl as string | null) ?? null,
    providerCostInr: (o.providerCostInr as number | null) ?? null,
  };
}
