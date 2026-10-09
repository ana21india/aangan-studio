import { timingSafeEqual } from "node:crypto";
import { PgNotifyStore } from "@/lib/notify/store-pg";
import { routerEnvFromProcess } from "@/lib/notify/router";
import { HttpTelegram } from "@/lib/telegram/client";
import { handleUpdate, type TgUpdate } from "@/lib/telegram/handlers";

function secretMatches(received: string | null): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Telegram calls this for button taps (Accept) and for callers talking to the bot.
// We always answer 200 after handling, so Telegram does not retry a failed update forever.
export async function POST(request: Request) {
  if (!secretMatches(request.headers.get("x-telegram-bot-api-secret-token"))) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  let update: TgUpdate;
  try {
    update = (await request.json()) as TgUpdate;
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  try {
    await handleUpdate(update, { tg: new HttpTelegram(), notify: new PgNotifyStore(), env: routerEnvFromProcess() });
  } catch (e) {
    console.error("telegram update failed:", e instanceof Error ? e.message : e);
  }
  return Response.json({ ok: true });
}
