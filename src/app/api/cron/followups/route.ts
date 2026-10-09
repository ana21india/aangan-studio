import { timingSafeEqual } from "node:crypto";
import { runFollowups } from "@/lib/notify/followups";
import { routerEnvFromProcess } from "@/lib/notify/router";
import { PgNotifyStore } from "@/lib/notify/store-pg";
import { PgStore } from "@/lib/pipeline/store-pg";
import { HttpTelegram } from "@/lib/telegram/client";

export const maxDuration = 30;

function authorised(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  const got = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!expected || !got) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Called every 5 minutes by a GitHub Actions schedule (.github/workflows/followups.yml).
export async function POST(request: Request) {
  if (!authorised(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  if (!botUsername) return Response.json({ error: "TELEGRAM_BOT_USERNAME not set" }, { status: 500 });

  const summary = await runFollowups({
    notify: new PgNotifyStore(),
    tg: new HttpTelegram(),
    cfg: await new PgStore().getConfig(),
    env: routerEnvFromProcess(),
    botUsername,
  });
  return Response.json(summary, { status: summary.errors.length ? 500 : 200 });
}
