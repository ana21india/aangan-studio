// One-time Telegram setup.
//   npm run telegram:setup                  finds your bot and the two groups, generates secrets, saves them to .env.local
//   npm run telegram:setup -- webhook URL   points Telegram at the deployed app (URL = https://your-app.vercel.app)
// Nothing secret is printed.
import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { telegramRaw } from "../src/lib/telegram/client";

config({ path: ".env.local" });

function setEnv(key: string, value: string) {
  const lines = readFileSync(".env.local", "utf-8").split(/\r?\n/);
  const i = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (i >= 0) lines[i] = `${key}=${value}`;
  else lines.push(`${key}=${value}`);
  writeFileSync(".env.local", lines.join("\n"));
}
const current = (key: string) => (process.env[key] ?? "").trim();
const secret = () => randomBytes(24).toString("hex");

async function main() {
  const token = current("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is empty in .env.local");
  const [cmd, arg] = process.argv.slice(2);

  const me = await telegramRaw<{ username: string; first_name: string }>(token, "getMe");
  console.log(`Bot found: @${me.username}`);
  setEnv("TELEGRAM_BOT_USERNAME", me.username);

  for (const k of ["TELEGRAM_WEBHOOK_SECRET", "CRON_SECRET", "VAANI_WEBHOOK_SECRET"]) {
    if (!current(k)) { setEnv(k, secret()); console.log(`Generated ${k}`); }
  }

  if (cmd === "webhook") {
    if (!arg) throw new Error("Give the app address, e.g. npm run telegram:setup -- webhook https://aangan-studio-iota.vercel.app");
    config({ path: ".env.local", override: true });
    await telegramRaw(token, "setWebhook", {
      url: `${arg.replace(/\/$/, "")}/api/webhooks/telegram`,
      secret_token: current("TELEGRAM_WEBHOOK_SECRET"),
      allowed_updates: ["message", "callback_query"],
    });
    const info = await telegramRaw<{ url: string; pending_update_count: number; last_error_message?: string }>(token, "getWebhookInfo");
    console.log(`Webhook set: ${info.url} (pending ${info.pending_update_count}${info.last_error_message ? `, last error: ${info.last_error_message}` : ""})`);
    return;
  }

  // Discover the two groups. getUpdates only works while no webhook is set.
  await telegramRaw(token, "deleteWebhook", { drop_pending_updates: false });
  const updates = await telegramRaw<{ message?: { chat: { id: number; title?: string; type: string } }; my_chat_member?: { chat: { id: number; title?: string; type: string } } }[]>(
    token, "getUpdates", { allowed_updates: ["message", "my_chat_member"] });
  const chats = new Map<number, { id: number; title?: string; type: string }>();
  for (const u of updates) {
    const c = u.message?.chat ?? u.my_chat_member?.chat;
    if (c && c.type !== "private") chats.set(c.id, c);
  }
  if (!chats.size) {
    console.log("\nNo groups seen yet. Send any message in BOTH groups (for example 'hello'), then run this again.");
    return;
  }
  console.log("\nGroups the bot can see:");
  for (const c of chats.values()) console.log(`  ${c.id}  ${c.title ?? "(no title)"}  [${c.type}]`);

  const find = (re: RegExp) => [...chats.values()].filter((c) => re.test(c.title ?? ""));
  const d = find(/design/i);
  const f = find(/front\s*desk/i);
  if (d.length === 1) { setEnv("TELEGRAM_DESIGNERS_CHAT_ID", String(d[0].id)); console.log(`\nDesigners chat saved: ${d[0].title}`); }
  else console.log("\nCould not pick the designers group by name (expects 'design' in the title).");
  if (f.length === 1) { setEnv("TELEGRAM_FRONTDESK_CHAT_ID", String(f[0].id)); console.log(`Front-desk chat saved: ${f[0].title}`); }
  else console.log("Could not pick the front-desk group by name (expects 'front desk' in the title).");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
