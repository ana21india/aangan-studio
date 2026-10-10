import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertNoPricing, buildPayloads, buildSystemPrompt, faqFrom, GREETING, redactAmounts } from "../src/lib/vaani/build";
import { handleVaaniWebhook, normalisePhoneNumber, syntheticPhone, verifyToken } from "../src/lib/voice/vaani";
import { MemoryVaaniSessions } from "../src/lib/voice/vaani-sessions";
import type { CallEndedEvent } from "../src/lib/voice/types";

const ROOM = "room-abc123";
const LONG = "AGENT: Hello, you've reached Aangan Studio.\n\nUSER: Hi, I have a 3BHK in Baner and want the whole flat redone, about 1,200 square feet, ready by March.\n\nAGENT: Lovely. Are you the owner?\n\nUSER: Yes, my husband and I.";

describe("Vaani events", () => {
  const setup = () => {
    const sessions = new MemoryVaaniSessions();
    const seen: CallEndedEvent[] = [];
    const deps = { sessions, process: async (e: CallEndedEvent) => { seen.push(e); }, now: () => new Date("2026-10-10T10:00:00Z") };
    return { sessions, seen, deps };
  };
  const post = (over: object = {}) => ({
    event: "call_postprocessing", call_id: "call-1", timestamp: "2026-10-10T10:05:00Z",
    data: { room_name: ROOM, call_id: "call-1", call_duration: 270_000, end_reason: "completed", summary: "s", recording_url: "https://rec/1.mp3", transcript: LONG },
    ...over,
  });

  it("links the caller's number from call_started to the finished call", async () => {
    const { seen, deps } = setup();
    await handleVaaniWebhook({ event: "call_started", room_name: ROOM, phone_number: "919876543210" }, deps);
    await handleVaaniWebhook(post(), deps);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ providerCallId: "call-1", callerPhone: "+919876543210", status: "completed", durationSec: 270, recordingUrl: "https://rec/1.mp3", channel: "phone" });
    expect(seen[0].transcript).toContain("USER:");
  });

  it("marks a call transferred once the human transfer succeeded", async () => {
    const { seen, deps } = setup();
    await handleVaaniWebhook({ event: "call_started", room_name: ROOM, phone_number: "+919876543210" }, deps);
    await handleVaaniWebhook({ event: "human_transfer_initiated", room_name: ROOM, transfer_type: "warm" }, deps);
    await handleVaaniWebhook({ event: "human_transfer_successful", room_name: ROOM, transfer_type: "warm" }, deps);
    await handleVaaniWebhook(post(), deps);
    expect(seen[0].status).toBe("transferred");
  });

  it("does not mark a failed transfer as transferred", async () => {
    const { seen, deps } = setup();
    await handleVaaniWebhook({ event: "call_started", room_name: ROOM, phone_number: "+919876543210" }, deps);
    await handleVaaniWebhook({ event: "human_transfer_failed", room_name: ROOM }, deps);
    await handleVaaniWebhook(post(), deps);
    expect(seen[0].status).toBe("completed");
  });

  it("treats a call with almost nothing said as dropped", async () => {
    const { seen, deps } = setup();
    await handleVaaniWebhook({ event: "call_started", room_name: ROOM, phone_number: "+919876543210" }, deps);
    await handleVaaniWebhook(post({ data: { room_name: ROOM, call_id: "call-2", call_duration: 8_000, transcript: "AGENT: Hello." } }), deps);
    expect(seen[0].status).toBe("dropped");
  });

  it("passes on an unknown caller as null instead of guessing", async () => {
    const { seen, deps } = setup();
    await handleVaaniWebhook(post(), deps);
    expect(seen[0].callerPhone).toBeNull();
  });

  it("gives a web test call a made-up, unreal number only when demo mode is on", async () => {
    const off = setup();
    await handleVaaniWebhook(post(), off.deps);
    expect(off.seen[0].callerPhone).toBeNull();

    const on = setup();
    await handleVaaniWebhook(post(), { ...on.deps, allowUnknownCaller: true });
    await handleVaaniWebhook(post({ call_id: "call-9", data: { room_name: ROOM, call_id: "call-9", call_duration: 90_000, transcript: LONG } }), { ...on.deps, allowUnknownCaller: true });
    expect(on.seen[0].callerPhone).toMatch(/^\+915000\d{6}$/);
    expect(on.seen[1].callerPhone).toBe(on.seen[0].callerPhone); // the same room always maps to the same number
    expect(syntheticPhone("room-other")).not.toBe(syntheticPhone(ROOM));
  });

  it("never replaces a real number with a made-up one", async () => {
    const { seen, deps } = setup();
    await handleVaaniWebhook({ event: "call_started", room_name: ROOM, phone_number: "919876543210" }, { ...deps, allowUnknownCaller: true });
    await handleVaaniWebhook(post(), { ...deps, allowUnknownCaller: true });
    expect(seen[0].callerPhone).toBe("+919876543210");
  });

  it("accepts a transcript sent as a list of turns", async () => {
    const { seen, deps } = setup();
    const turns = [{ role: "agent", text: "Hello." }, { role: "user", text: "I want to redo my flat in Baner, about 1,200 sq ft, ready by March, I am the owner." }];
    await handleVaaniWebhook(post({ data: { room_name: ROOM, call_id: "c3", call_duration: 90_000, transcript: turns } }), deps);
    expect(seen[0].transcript).toMatch(/^AGENT: Hello\.\n\nUSER: I want/);
  });

  it("ignores events that carry nothing we need", async () => {
    const { seen, deps } = setup();
    const r = await handleVaaniWebhook({ event: "call_ended", room_name: ROOM, call_duration: 40 }, deps);
    expect(r.handled).toMatch(/^ignored/);
    expect(seen).toHaveLength(0);
  });

  it("normalises phone numbers and checks the secret token", () => {
    expect(normalisePhoneNumber("98765 43210")).toBe("+919876543210");
    expect(normalisePhoneNumber("+14155550123")).toBe("+14155550123");
    expect(normalisePhoneNumber("123")).toBeNull();
    expect(verifyToken("s3cret", "s3cret")).toBe(true);
    expect(verifyToken("wrong", "s3cret")).toBe(false);
    expect(verifyToken(null, "s3cret")).toBe(false);
    expect(verifyToken("anything", undefined)).toBe(false);
  });
});

describe("what we push to Vaani", () => {
  const template = readFileSync("prompts/vaani_agent.md", "utf-8");
  const services = readFileSync("data/services.md", "utf-8");
  const rubric = readFileSync("data/qualified.md", "utf-8");
  const pricing = "Standard ₹1,800 – ₹2,400 per sq ft. Premium ₹2,400 – ₹3,500. Single room ₹3.5 lakh – ₹8 lakh. 1,200 – 1,800";

  it("fills the placeholders and strips every rupee amount from the rubric", () => {
    const prompt = buildSystemPrompt(template, services, rubric);
    expect(prompt).not.toMatch(/\{\{/);
    expect(prompt).toContain("Pune city");
    expect(prompt).not.toMatch(/₹/);
    expect(prompt).toContain("a very small amount");
  });

  it("passes the pricing gate for the real agent text", () => {
    const prompt = buildSystemPrompt(template, services, rubric);
    const payloads = buildPayloads(prompt, faqFrom(JSON.parse(readFileSync("prompts/vaani_faq.json", "utf-8"))));
    expect(() => assertNoPricing(JSON.stringify(payloads), pricing)).not.toThrow();
  });

  it("refuses to send anything that contains a price", () => {
    expect(() => assertNoPricing("It starts at 1,800 per sq ft", pricing)).toThrow(/Pricing figures/);
    expect(() => assertNoPricing("Typically around 5 lakh", pricing)).toThrow(/price-like/);
    expect(() => assertNoPricing("Costs ₹90", pricing)).toThrow(/price-like/);
    expect(() => assertNoPricing("We work in Pimple Nilakh", pricing)).not.toThrow();
  });

  it("redacts amounts in several shapes", () => {
    expect(redactAmounts("₹1–1.5 lakh for a flat")).toBe("a very small amount for a flat");
    expect(redactAmounts("about ₹50,000 maybe")).toBe("about a very small amount maybe");
  });

  it("opens with the AI and recording disclosure, and cannot be interrupted", () => {
    const p = buildPayloads("prompt", {}) as { persona: { identity: { greeting_message: { agent_message: string; interruptible: boolean } } } };
    expect(GREETING).toMatch(/AI assistant/);
    expect(GREETING).toMatch(/recorded/);
    expect(p.persona.identity.greeting_message.agent_message).toBe(GREETING);
    expect(p.persona.identity.greeting_message.interruptible).toBe(false);
  });

  it("uses a fast model with short replies, and forbids filler reactions and tool names", () => {
    const p = buildPayloads("prompt", {}) as { persona: { senses_capabilities: { brain: { llm: { primary: { model: string; parameters: { max_tokens: number } } } } } } };
    expect(p.persona.senses_capabilities.brain.llm.primary.model).toBe("gpt-4o-mini");
    expect(p.persona.senses_capabilities.brain.llm.primary.parameters.max_tokens).toBeLessThanOrEqual(300);
    expect(template).toMatch(/Never name any software/);
    expect(template).toMatch(/do not react to it/);
    expect(template).toMatch(/Will the owners be joining the consultation/);
    expect(template).toMatch(/echo/);
  });

  it("the FAQ never answers a price question with a number", () => {
    const faq = faqFrom(JSON.parse(readFileSync("prompts/vaani_faq.json", "utf-8")));
    for (const [q, a] of Object.entries(faq)) {
      if (/cost|rate|price/i.test(q)) expect(a).toMatch(/designer will walk you through it/);
    }
    expect(Object.keys(faq).length).toBeGreaterThan(10);
  });
});
