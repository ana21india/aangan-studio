import { describe, expect, it } from "vitest";
import { runChecks, type Scenario, type Turn } from "../src/lib/agent-sim/checks";
import { SCENARIOS } from "../src/lib/agent-sim/scenarios";

const base: Scenario = { id: "T", title: "t", persona: "p", opening: "hi", expect: { book: true }, outcome: "o" };
const agent = (text: string): Turn => ({ speaker: "agent", text });
const caller = (text: string): Turn => ({ speaker: "caller", text });
const calls = (...names: string[]) => names.map((name) => ({ name, args: {} }));
const rules = (s: Scenario, turns: Turn[], tools = calls()) => runChecks(s, turns, tools).map((f) => f.rule);
const GOOD = calls("Check_availability_booking", "book_appointment");

describe("agent test harness: hard rule checks", () => {
  it("requires the booking tools in the right order for a good fit", () => {
    expect(rules(base, [agent("Hello")], GOOD)).toEqual([]);
    expect(rules(base, [agent("Hello")], calls())).toContain("booking");
    expect(rules(base, [agent("Hello")], calls("book_appointment"))).toContain("booking-order");
    expect(rules(base, [agent("Hello")], calls("Check_availability_booking", "book_appointment", "book_appointment"))).toContain("double-booking");
  });

  it("fails a booking for someone who should not be booked", () => {
    const s = { ...base, expect: { book: false } };
    expect(rules(s, [agent("Hello")], GOOD)).toContain("booking");
    expect(rules(s, [agent("Hello")], calls())).toEqual([]);
  });

  it("requires a real transfer for upset callers, not just words", () => {
    const s = { ...base, expect: { book: false, transfer: true } };
    expect(rules(s, [agent("I will put you through now.")], calls())).toContain("transfer");
    expect(rules(s, [agent("I will put you through now.")], calls("transfer_call"))).toEqual([]);
  });

  it("catches prices, tool names, the word connect, congratulations, echo replies and stray scripts", () => {
    const bad = (text: string) => rules(base, [agent("Hello"), caller("x"), agent(text)], GOOD);
    expect(bad("It costs about 5 lakh")).toContain("price");
    expect(bad("Roughly ₹2,000 per sq ft")).toContain("price");
    expect(bad("I will send a Calendly link")).toContain("tool-names");
    expect(bad("Let me connect you")).toContain("word-connect");
    expect(bad("Congratulations on your new flat")).toContain("congratulations");
    expect(bad("Thank you for clarifying")).toContain("echo-reply");
    expect(bad("नमस्ते")).toContain("script");
    expect(rules({ ...base, allowDevanagari: true }, [agent("Hello"), caller("x"), agent("नमस्ते")], GOOD)).toEqual([]);
  });

  it("allows the approved price sentence even though it is long", () => {
    const sentence = "Pricing depends on the site, the materials you choose, and the scope, your designer will walk you through it in detail at the consultation. I can book that for you right now if you would like to go ahead with that today.";
    expect(rules(base, [agent("Hello"), caller("price?"), agent(sentence)], GOOD)).toEqual([]);
  });

  it("covers the scenarios we care about, with unique ids", () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(30);
    for (const id of ["E01", "B01", "M01", "M02", "X01", "D01", "G08"]) expect(ids).toContain(id);
  });
});
