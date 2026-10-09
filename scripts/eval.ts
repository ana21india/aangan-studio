// Runs the 40 test enquiries through mock call -> extraction -> scoring -> routing rules.
// Run with: npm run eval        Needs GEMINI_API_KEY in .env.local. No database is touched.
// Writes eval/out/results.csv and eval/out/summary.md.
import { config } from "dotenv";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { MockVoiceProvider, type MockEnquiry } from "../src/lib/voice/mock";
import { processCallEnded } from "../src/lib/pipeline/process-call";
import { MemoryStore } from "../src/lib/pipeline/store-memory";
import { analyseTranscript, type Analysis } from "../src/lib/ai/analyse";
import { PROMPT_VERSION } from "../src/lib/ai/prompts";
import { ratesFromEnv } from "../src/lib/pipeline/cost";

config({ path: ".env.local" });

class FileKnowledgeStore extends MemoryStore {
  async getKnowledge() {
    return {
      services: readFileSync("data/services.md", "utf-8"),
      qualified: readFileSync("data/qualified.md", "utf-8"),
    };
  }
}

const LABEL_NAME = { q: "qualified", n: "not_qualified", u: "unsure" } as const;
const labels: Record<string, "q" | "n" | "u"> = JSON.parse(readFileSync("eval/provisional_labels.json", "utf-8"));

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function runOne(e: MockEnquiry) {
  const store = new FileKnowledgeStore();
  let usage = { inputTokens: 0, outputTokens: 0 };
  let last: Analysis | null = null;
  const analyse = async (...args: Parameters<typeof analyseTranscript>) => {
    const a = await analyseTranscript(...args);
    usage = { inputTokens: usage.inputTokens + a.usage.inputTokens, outputTokens: usage.outputTokens + a.usage.outputTokens };
    last = a;
    return a;
  };
  let result;
  for (const ev of e.events) result = await processCallEnded(ev, { store, analyse, appBaseUrl: "https://example.invalid" });
  const enquiry = store.enquiries[0];
  const outcome = enquiry.result?.outcome;
  return { e, result: result!, outcome, analysis: last as Analysis | null, usage, store, note: enquiry.result?.handoffNote ?? null };
}

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

async function main() {
  if (!process.env.GEMINI_API_KEY) throw new Error("Set GEMINI_API_KEY in .env.local first");
  const enquiries = new MockVoiceProvider().replay();
  console.log(`Running ${enquiries.length} enquiries with ${process.env.GEMINI_MODEL ?? "gemini-2.5-flash"} (prompts ${PROMPT_VERSION})...`);

  const runs = await pool(enquiries, 4, async (e) => {
    try {
      const r = await runOne(e);
      process.stdout.write(`  ${e.id} -> ${r.result.category}\n`);
      return { ok: true as const, ...r };
    } catch (err) {
      process.stdout.write(`  ${e.id} FAILED: ${err instanceof Error ? err.message : err}\n`);
      return { ok: false as const, e, error: err instanceof Error ? err.message : String(err) };
    }
  });

  const header = [
    "id", "channel", "calls", "category", "my_provisional_label", "agrees", "escalation", "score", "confidence",
    "name", "space_type", "size_sqft", "location", "city", "scope", "timeline", "handover", "budget", "source", "decision_maker",
    "c1_real_project", "c2_service_area", "c3_timeline", "c4_budget", "c5_decision_maker", "reasons", "handoff_note", "front_desk_note_hidden_from_ai",
  ];
  const rows: string[] = [header.join(",")];
  const fieldNames = ["name", "space_type", "size_sqft", "location", "city", "scope", "timeline_text", "handover_date", "budget_text", "source"] as const;
  const missing: Record<string, number> = Object.fromEntries(fieldNames.map((f) => [f, 0]));
  const counts = { qualified: 0, not_qualified: 0, unsure: 0 };
  const lowConfidence: string[] = [];
  const disagree: string[] = [];
  const failed: string[] = [];
  let analysed = 0, agree = 0, tokensIn = 0, tokensOut = 0;

  for (const r of runs) {
    if (!r.ok) { failed.push(`${r.e.id}: ${r.error}`); rows.push([r.e.id, "", "", "FAILED", "", "", "", "", "", ...Array(19).fill(""), r.error].map(csvCell).join(",")); continue; }
    const { e, result, outcome, analysis, usage } = r;
    tokensIn += usage.inputTokens; tokensOut += usage.outputTokens;
    const cat = result.category!;
    counts[cat]++;
    const mine = LABEL_NAME[labels[e.id]];
    const agrees = mine === cat;
    if (agrees) agree++; else disagree.push(`${e.id}: system ${cat}, my label ${mine}${result.escalation ? ` (${result.escalation.reason})` : ""}`);
    const f = analysis?.fields;
    if (f) {
      analysed++;
      for (const k of fieldNames) if (f[k] == null) missing[k]++;
      if (analysis!.assessment.confidence === "low") lowConfidence.push(e.id);
    }
    const c = outcome?.criteria;
    rows.push([
      e.id, e.events[0].channel, e.events.length, cat, mine, agrees ? "yes" : "NO", result.escalation?.reason ?? "",
      analysis?.assessment.score ?? "", analysis?.assessment.confidence ?? (result.skippedAnalysis ? `skipped (${result.skippedAnalysis})` : ""),
      f?.name, f?.space_type, f?.size_sqft, f?.location, f?.city, f?.scope, f?.timeline_text, f?.handover_date, f?.budget_text, f?.source, f?.decision_maker_note,
      c ? `${c.real_project.status}: ${c.real_project.reason}` : "", c ? `${c.service_area.status}: ${c.service_area.reason}` : "",
      c ? `${c.timeline.status}: ${c.timeline.reason}` : "", c ? `${c.budget.status}: ${c.budget.reason}` : "",
      c ? `${c.decision_maker.status}: ${c.decision_maker.reason}` : "",
      outcome?.reasons.join(" | ") ?? "", r.note ?? "", e.hiddenNote ?? "",
    ].map(csvCell).join(","));
  }

  mkdirSync("eval/out", { recursive: true });
  writeFileSync("eval/out/results.csv", "﻿" + rows.join("\n"), "utf-8");

  const ok = runs.filter((r) => r.ok).length;
  const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "n/a");
  const rates = ratesFromEnv();
  const cost = (tokensIn * rates.geminiPerMInputInr + tokensOut * rates.geminiPerMOutputInr) / 1_000_000;
  const summary = [
    `# Evaluation summary`,
    ``,
    `Model: ${process.env.GEMINI_MODEL ?? "gemini-2.5-flash"} · prompts ${PROMPT_VERSION} · ${new Date().toISOString().slice(0, 16)}Z`,
    ``,
    `- Enquiries run: ${ok} of ${enquiries.length}${failed.length ? ` (${failed.length} failed)` : ""}`,
    `- **Qualified: ${counts.qualified} (${pct(counts.qualified, ok)})** · Not qualified: ${counts.not_qualified} (${pct(counts.not_qualified, ok)}) · Unsure: ${counts.unsure} (${pct(counts.unsure, ok)})`,
    `- Agreement with Claude's provisional labels: ${agree} of ${ok} (${pct(agree, ok)}). These labels are not ground truth.`,
    `- Tokens: ${tokensIn.toLocaleString()} in, ${tokensOut.toLocaleString()} out${cost ? ` · about INR ${cost.toFixed(2)} for the whole run` : " (set the Gemini unit costs in .env.local to see INR)"}`,
    ``,
    `## Fields most often missing (of ${analysed} analysed enquiries)`,
    ...Object.entries(missing).sort((a, b) => b[1] - a[1]).map(([k, n]) => `- ${k}: ${n} (${pct(n, analysed)})`),
    ``,
    `## Low-confidence cases`,
    lowConfidence.length ? lowConfidence.map((i) => `- ${i}`).join("\n") : "- none",
    ``,
    `## Where the system and my provisional label differ`,
    disagree.length ? disagree.map((d) => `- ${d}`).join("\n") : "- none",
    ``,
    `## Failures`,
    failed.length ? failed.map((d) => `- ${d}`).join("\n") : "- none",
    ``,
  ].join("\n");
  writeFileSync("eval/out/summary.md", summary, "utf-8");
  console.log("\n" + summary);
  console.log("Wrote eval/out/results.csv and eval/out/summary.md");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
