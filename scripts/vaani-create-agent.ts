// Creates a clean Vaani agent with no starter template, then prints its id.
//   npm run vaani:create -- "Agent name"
// Afterwards put the id in VAANI_AGENT_ID and run npm run vaani:sync.
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const name = process.argv[2] ?? "Aangan Studio Phone Agent";
  const res = await fetch("https://api.vaanivoice.ai/api/create-agent", {
    method: "POST",
    headers: { "X-API-Key": process.env.VAANI_API_KEY!, "content-type": "application/json" },
    body: JSON.stringify({ agent_display_name: name, config: {} }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Create failed: HTTP ${res.status} ${text.slice(0, 300)}`);
  const j = JSON.parse(text) as { agent_id: string; agent_name: string };
  console.log(`Created "${j.agent_name}". Agent id: ${j.agent_id}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
