// One-time HubSpot setup. Needs HUBSPOT_PRIVATE_APP_TOKEN in .env.local.
//   npm run hubspot:setup                     lists your deal pipelines and stages
//   npm run hubspot:setup -- "<new stage name>" "<booked stage name>"
//                                             picks those two stages (by name) and saves their ids to .env.local
import { config } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";
import { HubSpot } from "../src/lib/crm/hubspot";

config({ path: ".env.local" });

function setEnv(key: string, value: string) {
  const lines = readFileSync(".env.local", "utf-8").split(/\r?\n/);
  const i = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (i >= 0) lines[i] = `${key}=${value}`;
  else lines.push(`${key}=${value}`);
  writeFileSync(".env.local", lines.join("\n"));
}

async function main() {
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
  if (!token) throw new Error("HUBSPOT_PRIVATE_APP_TOKEN is empty in .env.local");
  const hs = new HubSpot({ token, pipelineId: "", stageNew: "", stageBooked: "" });
  const { results } = await hs.listDealPipelines();

  console.log("Your deal pipelines and stages:");
  for (const p of results) {
    console.log(`\n  Pipeline: ${p.label}`);
    for (const s of p.stages) console.log(`    - ${s.label}`);
  }

  const [newName, bookedName] = process.argv.slice(2);
  if (!newName || !bookedName) {
    console.log('\nNext: npm run hubspot:setup -- "<stage for new qualified enquiries>" "<stage for booked meetings>"');
    return;
  }
  const norm = (x: string) => x.trim().toLowerCase();
  for (const p of results) {
    const a = p.stages.find((s) => norm(s.label) === norm(newName));
    const b = p.stages.find((s) => norm(s.label) === norm(bookedName));
    if (a && b) {
      setEnv("HUBSPOT_PIPELINE_ID", p.id);
      setEnv("HUBSPOT_STAGE_NEW", a.id);
      setEnv("HUBSPOT_STAGE_BOOKED", b.id);
      console.log(`\nSaved: pipeline "${p.label}", new = "${a.label}", booked = "${b.label}"`);
      return;
    }
  }
  throw new Error("Could not find both stage names in one pipeline. Check the spelling against the list above.");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
