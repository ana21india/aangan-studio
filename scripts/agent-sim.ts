// Plays ~30 pretend callers against the agent's instructions and grades each call.
//   npm run agent:sim                     all scenarios
//   npm run agent:sim -- G01 D03 E01     only these
//   npm run agent:sim -- --runs 2        run each scenario twice (shows how consistent the agent is)
// The agent's "brain" here is a Gemini model driven by the exact prompt we push to Vaani, with simulated tools.
// Vaani's own model (gpt-4o-mini) is not available here, so SIM_AGENT_MODEL defaults to a small, weaker model on purpose:
// if the rules hold for it, they are likely to hold for the real one. Writes eval/out/agent-sim.md and agent-sim.json.
import { config } from "dotenv";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { buildPayloads, buildSystemPrompt, faqFrom, GREETING } from "../src/lib/vaani/build";
import { generate, textOf, type Content, type FunctionDecl } from "../src/lib/agent-sim/gemini-chat";
import { runChecks, type Finding, type Scenario, type ToolCall, type Turn } from "../src/lib/agent-sim/checks";
import { SCENARIOS } from "../src/lib/agent-sim/scenarios";

config({ path: ".env.local" });

const AGENT_MODEL = process.env.SIM_AGENT_MODEL ?? "gemini-3.1-flash-lite";
const CALLER_MODEL = process.env.SIM_CALLER_MODEL ?? "gemini-3.8-flash";
const MAX_TURNS = 14;

const TOOLS: FunctionDecl[] = [
  { name: "Check_availability_booking", description: "Looks up free consultation times for a day. Use only for a caller who is a good fit and wants to book.",
    parameters: { type: "OBJECT", properties: { day: { type: "STRING", description: "The day the caller prefers, e.g. 'next Tuesday'" } }, required: ["day"] } },
  { name: "book_appointment", description: "Books ONE consultation at a time chosen from the free times. Use only after checking availability and after the caller picked a time.",
    parameters: { type: "OBJECT", properties: { start_time: { type: "STRING" }, name: { type: "STRING" } }, required: ["start_time", "name"] } },
  { name: "transfer_call", description: "Transfers the call to a human at the front desk.",
    parameters: { type: "OBJECT", properties: { context_summary: { type: "STRING" } }, required: ["context_summary"] } },
];

const DAYS: [RegExp, string][] = [
  [/sat/i, "Saturday 17 October"], [/sun/i, "Sunday 18 October"], [/mon/i, "Monday 12 October"], [/tue/i, "Tuesday 13 October"],
  [/wed/i, "Wednesday 14 October"], [/thu/i, "Thursday 15 October"], [/fri/i, "Friday 16 October"],
];

function toolResult(name: string, args: Record<string, unknown> = {}): Record<string, unknown> {
  if (name === "Check_availability_booking") {
    const day = DAYS.find(([re]) => re.test(String(args.day ?? "")))?.[1] ?? "Tuesday 13 October";
    return { free_times_india_time: [`${day}, 10:30 am`, `${day}, 3:00 pm`, `${day}, 5:00 pm`] };
  }
  if (name === "book_appointment") return { status: "confirmed" };
  return { status: "transfer_started" };
}

function agentPrompt(): string {
  const template = readFileSync("prompts/vaani_agent.md", "utf-8");
  const prompt = buildSystemPrompt(template, readFileSync("data/services.md", "utf-8"), readFileSync("data/qualified.md", "utf-8"));
  const faq = faqFrom(JSON.parse(readFileSync("prompts/vaani_faq.json", "utf-8")));
  // Vaani also holds the FAQ pairs as separate knowledge; include them the same way here.
  const faqText = Object.entries(faq).map(([q, a]) => `Q: ${q}\nA: ${a}`).join("\n\n");
  void buildPayloads;
  // In Vaani, "@tool_name" in the instructions is the platform's way of pointing at a function tool.
  // Here the tools are real Gemini functions, so tell the model to call them as functions, never to type them.
  const mapped = prompt.replace(/@(transfer_call|book_appointment|Check_availability_booking)/g, "the `$1` function (call it as a real function call; never type it as text)");
  return `${mapped}\n\n# Approved answers (reproduce as written)\n\n${faqText}`;
}

const CALLER_SYSTEM = (s: Scenario) => `You are role-playing a person who has phoned Aangan Studio, an interior design studio in Pune, India, and is talking to its AI phone assistant.
Who you are and what you know: ${s.persona}

How to behave:
- Speak like a real person on a phone: one or two short sentences, natural Indian English (or the language in your persona). No lists.
- Reveal a fact only when you are asked or it comes up naturally. Answer only what was asked. Do not volunteer a budget unless your persona says you state one.
- Stay in character and stay consistent with your persona. If asked something your persona does not cover, answer plausibly and briefly, or say you are not sure.
- If the assistant offers times to book a consultation, pick one that suits you (if you are a person who would book).
- When the call has reached a natural end (the assistant said goodbye, confirmed a booking, politely declined, or is transferring you), reply with exactly [END]. Never write anything else on that turn.
Reply with ONLY what you would say out loud.`;

interface Result {
  id: string;
  title: string;
  pass: boolean;
  findings: Finding[];
  turns: Turn[];
  tools: ToolCall[];
  judgeNotes: string;
}

async function agentSpeaks(system: string, history: Content[], tools: ToolCall[]): Promise<string> {
  const spoken: string[] = [];
  for (let hop = 0; hop < 4; hop++) {
    const { content } = await generate({ model: AGENT_MODEL, system, contents: history, tools: TOOLS, temperature: 0.2 });
    const calls = content.parts.filter((p) => p.functionCall);
    const said = textOf(content);
    if (said) spoken.push(said); // words spoken in the same turn as a tool call are still heard by the caller
    if (!calls.length) return spoken.join(" ") || "...";
    history.push(content);
    const responses = calls.map((p) => {
      const fc = p.functionCall!;
      tools.push({ name: fc.name, args: fc.args ?? {} });
      return { functionResponse: { name: fc.name, response: toolResult(fc.name, fc.args ?? {}) } };
    });
    history.push({ role: "user", parts: responses });
    if (calls.some((p) => p.functionCall!.name === "transfer_call")) {
      // the real tool plays its own announcement, then the call is handed over
      try {
        const { content: after } = await generate({ model: AGENT_MODEL, system, contents: history, tools: TOOLS, temperature: 0.2 });
        const t = textOf(after);
        if (t) spoken.push(t);
      } catch { /* the model stays quiet after a transfer */ }
      return spoken.join(" ") || "Please hold while I put you through to our front desk.";
    }
  }
  return spoken.join(" ") || "...";
}

async function simulate(s: Scenario, system: string): Promise<Omit<Result, "pass" | "findings" | "judgeNotes">> {
  const turns: Turn[] = [{ speaker: "agent", text: GREETING }];
  const tools: ToolCall[] = [];
  const agentHist: Content[] = [{ role: "user", parts: [{ text: "(the call has just connected)" }] }, { role: "model", parts: [{ text: GREETING }] }];
  let callerSaid = s.opening;

  for (let i = 0; i < MAX_TURNS; i++) {
    turns.push({ speaker: "caller", text: callerSaid });
    agentHist.push({ role: "user", parts: [{ text: callerSaid }] });
    const reply = await agentSpeaks(system, agentHist, tools);
    turns.push({ speaker: "agent", text: reply });
    agentHist.push({ role: "model", parts: [{ text: reply }] });
    if (tools.some((t) => t.name === "transfer_call")) break;

    const callerHist: Content[] = turns.map((t) => ({ role: t.speaker === "caller" ? "model" : "user", parts: [{ text: t.text }] }));
    const { content } = await generate({ model: CALLER_MODEL, system: CALLER_SYSTEM(s), contents: callerHist, temperature: 0.7 });
    callerSaid = textOf(content);
    if (/^\[?END\]?\.?$/i.test(callerSaid.trim()) || callerSaid.includes("[END]")) break;
  }
  return { id: s.id, title: s.title, turns, tools };
}

const JUDGE_SYSTEM = `You grade a phone call between a caller and the AI phone assistant of Aangan Studio (interior design, Pune and PCMC only).
You are given the studio's rules, what a correct call looks like for this scenario, the transcript, and which tools were used.
Check ONLY these rules, and report a failure only when the transcript clearly shows it:
1. never_asks_budget: the assistant never asks the caller about their budget or what they want to spend.
2. no_reasking: the assistant never asks for something the caller already told it earlier in the call.
3. no_invention: the assistant never states or implies facts the caller did not say and the rules do not contain (for example calling a home "new", congratulating them, inventing offers, discounts, free consultations, minimum sizes, fees or timelines).
4. one_question: no single assistant turn asks more than one question.
5. tone: calm, brief, polite; no lecturing; apologises sincerely to upset callers.
6. scenario_outcome: the call matches the "correct call" description for this scenario (given below).
7. language: the assistant replies in the language the caller is using.
Respond ONLY with JSON: {"pass": boolean, "failures": [{"rule": string, "evidence": string}], "notes": string}. "evidence" quotes the transcript. If nothing failed, "failures" is empty.`;

async function judge(s: Scenario, r: Pick<Result, "turns" | "tools">, rules: string): Promise<{ failures: Finding[]; notes: string }> {
  const transcript = r.turns.map((t) => `${t.speaker === "agent" ? "ASSISTANT" : "CALLER"}: ${t.text}`).join("\n");
  const tools = r.tools.length ? r.tools.map((t) => `${t.name}(${JSON.stringify(t.args)})`).join("; ") : "none";
  const user = `=== STUDIO RULES ===\n${rules}\n\n=== SCENARIO ===\n${s.title}\nCaller persona: ${s.persona}\nWhat a correct call looks like: ${s.outcome}\n\n=== TRANSCRIPT ===\n${transcript}\n\n=== TOOLS USED ===\n${tools}`;
  const { content } = await generate({ model: CALLER_MODEL, system: JUDGE_SYSTEM, contents: [{ role: "user", parts: [{ text: user }] }], json: true, temperature: 0 });
  try {
    const j = JSON.parse(textOf(content)) as { failures?: { rule: string; evidence: string }[]; notes?: string };
    return { failures: (j.failures ?? []).map((f) => ({ rule: f.rule, detail: f.evidence })), notes: j.notes ?? "" };
  } catch {
    return { failures: [{ rule: "judge", detail: "judge returned unreadable output" }], notes: "" };
  }
}

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const runsIdx = args.indexOf("--runs");
  const runs = runsIdx >= 0 ? Number(args[runsIdx + 1]) || 1 : 1;
  const ids = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--runs");
  const chosen = SCENARIOS.filter((s) => !ids.length || ids.includes(s.id));
  if (!chosen.length) throw new Error("No matching scenarios");

  const system = agentPrompt();
  const rules = readFileSync("data/services.md", "utf-8") + "\n\n" + readFileSync("data/qualified.md", "utf-8") + "\n\nApproved price answer: \"Pricing depends on the site, the materials you choose, and the scope — your designer will walk you through it in detail at the consultation. I can book that for you right now if you'd like.\" The assistant never states any price, rate or range, and does not ask about budget.";
  const jobs = chosen.flatMap((s) => Array.from({ length: runs }, (_, k) => ({ s, k })));
  console.log(`Agent brain: ${AGENT_MODEL} · caller and judge: ${CALLER_MODEL} · ${jobs.length} calls`);

  const results = await pool(jobs, 5, async ({ s, k }) => {
    try {
      const sim = await simulate(s, system);
      const hard = runChecks(s, sim.turns, sim.tools);
      const soft = await judge(s, sim, rules);
      const findings = [...hard, ...soft.failures];
      const r: Result = { ...sim, id: runs > 1 ? `${s.id}#${k + 1}` : s.id, pass: findings.length === 0, findings, judgeNotes: soft.notes };
      process.stdout.write(`  ${r.id.padEnd(6)} ${r.pass ? "PASS" : "FAIL"}  ${s.title}${r.pass ? "" : `  [${[...new Set(findings.map((f) => f.rule))].join(", ")}]`}\n`);
      return r;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      process.stdout.write(`  ${s.id.padEnd(6)} ERROR ${msg.slice(0, 100)}\n`);
      return { id: s.id, title: s.title, pass: false, findings: [{ rule: "harness", detail: msg }], turns: [], tools: [], judgeNotes: "" } as Result;
    }
  });

  const passed = results.filter((r) => r.pass).length;
  const byRule = new Map<string, number>();
  for (const r of results) for (const f of new Set(r.findings.map((x) => x.rule))) byRule.set(f, (byRule.get(f) ?? 0) + 1);

  mkdirSync("eval/out", { recursive: true });
  const md = [
    `# Agent simulation`,
    `${new Date().toISOString().slice(0, 16)}Z · brain ${AGENT_MODEL} · prompt ${/Version: ([\d.\-]+)/.exec(readFileSync("prompts/vaani_agent.md", "utf-8"))?.[1] ?? "?"}`,
    ``,
    `**${passed} of ${results.length} calls passed.**`,
    ``,
    `## Failures by rule`,
    ...(byRule.size ? [...byRule.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `- ${k}: ${n}`) : ["- none"]),
    ``,
    `## Failed calls`,
    ...results.filter((r) => !r.pass).flatMap((r) => [
      `### ${r.id}: ${r.title}`,
      ...r.findings.map((f) => `- **${f.rule}**: ${f.detail}`),
      "```",
      ...r.turns.map((t) => `${t.speaker === "agent" ? "AGENT " : "CALLER"}: ${t.text}`),
      r.tools.length ? `TOOLS : ${r.tools.map((t) => t.name).join(", ")}` : "",
      "```",
      "",
    ]),
  ].join("\n");
  writeFileSync("eval/out/agent-sim.md", md, "utf-8");
  writeFileSync("eval/out/agent-sim.json", JSON.stringify(results, null, 1), "utf-8");
  console.log(`\n${passed} of ${results.length} passed.`);
  for (const [k, n] of [...byRule.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${n}`);
  console.log("Details: eval/out/agent-sim.md");

  // For automated checks: fail the run if fewer than this share of calls passed (e.g. SIM_MIN_PASS_RATE=0.8).
  const min = Number(process.env.SIM_MIN_PASS_RATE);
  if (min > 0 && passed / results.length < min) {
    console.error(`Pass rate ${Math.round((100 * passed) / results.length)}% is below the required ${Math.round(100 * min)}%.`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
