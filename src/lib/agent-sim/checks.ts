// Deterministic rule checks on a simulated call. The judge (an AI) handles the fuzzy rules; these catch the hard ones.
export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface Turn {
  speaker: "agent" | "caller";
  text: string;
}

export interface Expectation {
  book: boolean; // must / must not book a consultation
  transfer?: boolean; // must / must not transfer to a person (omit = either is fine)
}

export interface Scenario {
  id: string;
  title: string;
  persona: string; // facts the caller knows and how they behave
  opening: string; // the first thing the caller says
  expect: Expectation;
  outcome: string; // what a correct call looks like, in plain words, for the judge
  allowDevanagari?: boolean; // Hindi or Marathi callers
}

export interface Finding {
  rule: string;
  detail: string;
}

const DEVANAGARI = /[ऀ-ॿ]/;
const PRICE = /₹|\brs\.?\s?\d|\binr\b|\blakhs?\b|\bcrores?\b|per\s+(?:sq\.?\s?ft|square\s+f)/i;
const TOOLNAMES = /calendly|cal\.com|telegram|whatsapp/i;
const CONNECT = /\bconnect(?:ing|ed|s)?\b/i;
const CONGRATS = /congratulat/i;
const ECHO_REPLY = /thank you for clarifying/i;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export function runChecks(s: Scenario, turns: Turn[], tools: ToolCall[]): Finding[] {
  const f: Finding[] = [];
  const agent = turns.filter((t) => t.speaker === "agent");
  const booked = tools.some((t) => t.name === "book_appointment");
  const transferred = tools.some((t) => t.name === "transfer_call");

  if (booked !== s.expect.book) f.push({ rule: "booking", detail: s.expect.book ? "should have booked a consultation but did not" : "booked a consultation but should not have" });
  if (s.expect.transfer !== undefined && transferred !== s.expect.transfer) {
    f.push({ rule: "transfer", detail: s.expect.transfer ? "should have transferred to a person" : "transferred to a person but should not have" });
  }
  if (tools.filter((t) => t.name === "book_appointment").length > 1) f.push({ rule: "double-booking", detail: "booked more than once" });
  const bookIdx = tools.findIndex((t) => t.name === "book_appointment");
  const checkIdx = tools.findIndex((t) => t.name === "Check_availability_booking");
  if (bookIdx >= 0 && (checkIdx < 0 || checkIdx > bookIdx)) f.push({ rule: "booking-order", detail: "booked without checking availability first" });

  agent.forEach((t, i) => {
    const ref = `agent turn ${i + 1}: "${t.text.slice(0, 90)}"`;
    if (!s.allowDevanagari && DEVANAGARI.test(t.text)) f.push({ rule: "script", detail: `Devanagari in English call, ${ref}` });
    if (PRICE.test(t.text)) f.push({ rule: "price", detail: `price-like words, ${ref}` });
    if (TOOLNAMES.test(t.text)) f.push({ rule: "tool-names", detail: `named a tool or app, ${ref}` });
    if (CONNECT.test(t.text)) f.push({ rule: "word-connect", detail: `used the word "connect", ${ref}` });
    if (CONGRATS.test(t.text)) f.push({ rule: "congratulations", detail: `congratulated the caller, ${ref}` });
    if (ECHO_REPLY.test(t.text)) f.push({ rule: "echo-reply", detail: `replied to an echo, ${ref}` });
    if (i > 0 && words(t.text) > 60 && !/walk you through it in detail/i.test(t.text)) f.push({ rule: "too-long", detail: `${words(t.text)} words in one turn, ${ref}` });
  });
  return f;
}
