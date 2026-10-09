// Pushes the agent's instructions, FAQ and call settings to Vaani.
//   npm run vaani:sync -- --dry-run      builds everything and checks it, sends nothing
//   npm run vaani:sync                   sends it to the agent named in VAANI_AGENT_ID
// Documents come from the database (the source of truth). pricing.md is never sent.
import { config } from "dotenv";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { assertNoPricing, buildPayloads, buildSystemPrompt, faqFrom } from "../src/lib/vaani/build";

config({ path: ".env.local" });

const BASE = "https://api.vaanivoice.ai";

async function patch(path: string, body: unknown, key: string) {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: { "X-API-Key": key, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Vaani ${path} failed: HTTP ${res.status} ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as { warnings?: unknown[] };
  return json.warnings ?? [];
}

async function main() {
  const dry = process.argv.includes("--dry-run");
  const sql = neon(process.env.DATABASE_URL!);
  const docs = (await sql.query("select name, content, version from knowledge_docs")) as { name: string; content: string; version: number }[];
  const get = (n: string) => {
    const d = docs.find((x) => x.name === n);
    if (!d) throw new Error(`${n} is missing from the database. Run npm run seed:knowledge`);
    return d;
  };

  const template = readFileSync("prompts/vaani_agent.md", "utf-8");
  const prompt = buildSystemPrompt(template, get("services.md").content, get("qualified.md").content);
  const faq = faqFrom(JSON.parse(readFileSync("prompts/vaani_faq.json", "utf-8")));
  const payloads = buildPayloads(prompt, faq);

  // Safety gate: nothing from the pricing guide may be in what we send.
  assertNoPricing(JSON.stringify(payloads), get("pricing.md").content);

  mkdirSync("eval/out", { recursive: true });
  writeFileSync("eval/out/vaani_prompt_synced.md", prompt, "utf-8");
  console.log(`Agent prompt: ${prompt.length} characters. FAQ pairs: ${Object.keys(faq).length}. Pricing check passed.`);
  console.log("Prompt saved to eval/out/vaani_prompt_synced.md for you to read.");
  if (dry) { console.log("Dry run: nothing was sent."); return; }

  const key = process.env.VAANI_API_KEY;
  const agent = process.env.VAANI_AGENT_ID;
  if (!key || !agent) throw new Error("Set VAANI_API_KEY and VAANI_AGENT_ID in .env.local");

  for (const [part, body] of Object.entries(payloads)) {
    const warnings = await patch(`/api/agent/${agent}/${part}`, body, key);
    console.log(`${part}: updated${warnings.length ? ` (warnings: ${JSON.stringify(warnings)})` : ""}`);
  }
  await sql.query("update knowledge_docs set synced_to_vaani_at = now() where name in ('services.md', 'qualified.md')");
  console.log("Done. Knowledge documents marked as synced.");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
