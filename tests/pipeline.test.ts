import { describe, expect, it, vi } from "vitest";
import { processCallEnded } from "../src/lib/pipeline/process-call";
import { computeCosts } from "../src/lib/pipeline/cost";
import { isInHours, maskPhone } from "../src/lib/pipeline/hours";
import { sign, verifySignature } from "../src/lib/voice/signature";
import { MockVoiceProvider } from "../src/lib/voice/mock";
import { analysis, event, MemoryStore } from "./helpers";

const rates = { vaaniPerMinInr: 10, geminiPerMInputInr: 20, geminiPerMOutputInr: 80 };

describe("idempotency", () => {
  it("a duplicate webhook creates nothing new and never a second handoff", async () => {
    const store = new MemoryStore();
    const analyse = vi.fn(async () => analysis());
    const first = await processCallEnded(event(), { store, analyse, rates });
    const second = await processCallEnded(event(), { store, analyse, rates });

    expect(first.category).toBe("qualified");
    expect(first.handoffNote).toMatch(/New qualified enquiry/);
    expect(second.duplicate).toBe(true);
    expect(analyse).toHaveBeenCalledTimes(1);
    expect(store.calls).toHaveLength(1);
    expect(store.enquiries).toHaveLength(1);
  });
});

describe("repeat calls (T17, D-008)", () => {
  it("merges a dropped call and its retry into one enquiry and cancels the callback alert", async () => {
    const store = new MemoryStore();
    const analyse = vi.fn(async () => analysis());
    const dropped = await processCallEnded(
      event({ providerCallId: "a", transcript: "Caller: Hi, I wanted to inquire about —", status: "dropped" }),
      { store, analyse, rates },
    );
    expect(dropped.escalation?.reason).toBe("dropped_call");
    expect(analyse).not.toHaveBeenCalled();

    const retry = await processCallEnded(
      event({ providerCallId: "b", startedAt: new Date("2026-09-02T04:55:00Z") }),
      { store, analyse, rates },
    );
    expect(retry.enquiryId).toBe(dropped.enquiryId);
    expect(retry.category).toBe("qualified");
    expect(store.enquiries).toHaveLength(1);
    expect(store.escalations.find((e) => e.reason === "dropped_call")?.resolved).toBe(true);
  });

  it("keeps the callback alert open if the second call is still unclear", async () => {
    const store = new MemoryStore();
    const unclearAnalysis = async () => analysis({}, { timeline: { status: "unclear", reason: "not said" } });
    await processCallEnded(event({ providerCallId: "a", transcript: "short", status: "dropped" }), { store, analyse: unclearAnalysis, rates });
    const retry = await processCallEnded(event({ providerCallId: "b", startedAt: new Date("2026-09-02T04:55:00Z") }), { store, analyse: unclearAnalysis, rates });
    expect(retry.category).toBe("unsure");
    expect(store.escalations.find((e) => e.reason === "dropped_call")?.resolved).toBeUndefined();
  });

  it("does not merge calls hours apart", async () => {
    const store = new MemoryStore();
    const analyse = async () => analysis();
    await processCallEnded(event({ providerCallId: "a" }), { store, analyse, rates });
    await processCallEnded(event({ providerCallId: "b", startedAt: new Date("2026-09-02T09:00:00Z") }), { store, analyse, rates });
    expect(store.enquiries).toHaveLength(2);
  });
});

describe("missed calls (T08)", () => {
  it("asks the front desk to call back without calling Gemini", async () => {
    const store = new MemoryStore();
    const analyse = vi.fn();
    const r = await processCallEnded(event({ providerCallId: "m", status: "missed", transcript: null, durationSec: 0 }), { store, analyse, rates });
    expect(r.escalation?.reason).toBe("missed_call");
    expect(analyse).not.toHaveBeenCalled();
  });

  it("refuses a call with no caller number instead of guessing", async () => {
    await expect(processCallEnded(event({ callerPhone: null }), { store: new MemoryStore(), analyse: async () => analysis(), rates })).rejects.toThrow(/no caller phone/);
  });
});

describe("cost calculation", () => {
  it("uses duration x rate for Vaani and token counts for Gemini", () => {
    const rows = computeCosts(event({ durationSec: 300 }), { inputTokens: 1_000_000, outputTokens: 500_000 }, rates);
    const vaani = rows.find((r) => r.line === "vaani_minutes")!;
    expect(vaani.quantity).toBe(5);
    expect(vaani.amount_inr).toBe(50);
    const g = rows.filter((r) => r.line === "gemini_tokens");
    expect(g.map((r) => r.amount_inr)).toEqual([20, 40]);
  });

  it("prefers the provider's own cost figure", () => {
    const rows = computeCosts(event({ durationSec: 120, providerCostInr: 7 }), null, rates);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount_inr).toBe(7);
  });

  it("adds no Vaani cost for text channels", () => {
    expect(computeCosts(event({ channel: "web", durationSec: null }), null, rates)).toEqual([]);
  });
});

describe("signatures", () => {
  const body = '{"providerCallId":"x"}';
  it("accepts the right signature and rejects missing or wrong ones", () => {
    const good = sign("secret", body);
    expect(verifySignature("secret", body, good)).toBe(true);
    expect(verifySignature("secret", body, `sha256=${good}`)).toBe(true);
    expect(verifySignature("secret", body, null)).toBe(false);
    expect(verifySignature("secret", body, "deadbeef")).toBe(false);
    expect(verifySignature("secret", body + " ", good)).toBe(false);
    expect(verifySignature(undefined, body, good)).toBe(false);
  });
});

describe("helpers", () => {
  it("computes office hours in India time", () => {
    expect(isInHours(new Date("2026-09-02T04:53:00Z"), 10, 19)).toBe(true); // 10:23 IST
    expect(isInHours(new Date("2026-09-09T17:17:00Z"), 10, 19)).toBe(false); // 22:47 IST
  });
  it("masks phone numbers for logs", () => {
    expect(maskPhone("+919876543210")).toBe("+91******10");
  });
});

describe("MockVoiceProvider", () => {
  it("replays the 40 test enquiries as 41 calls and hides front-desk notes", () => {
    const all = new MockVoiceProvider().replay();
    expect(all).toHaveLength(40);
    expect(all.flatMap((e) => e.events)).toHaveLength(41);
    expect(all.find((e) => e.id === "T08")!.events[0].status).toBe("missed");
    const t17 = all.find((e) => e.id === "T17")!.events;
    expect(t17.map((e) => e.status)).toEqual(["dropped", "completed"]);
    expect(t17[0].callerPhone).toBe(t17[1].callerPhone);
    for (const e of all) for (const ev of e.events) expect(ev.transcript ?? "").not.toMatch(/^(Note|Status):/m);
  });
});
