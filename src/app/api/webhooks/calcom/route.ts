import { handleBooking, type CalWebhook } from "@/lib/calcom/bookings";
import { HubSpot, hubspotEnvFromProcess } from "@/lib/crm/hubspot";
import { routerEnvFromProcess } from "@/lib/notify/router";
import { PgNotifyStore } from "@/lib/notify/store-pg";
import { HttpTelegram } from "@/lib/telegram/client";
import { verifySignature } from "@/lib/voice/signature";

export const maxDuration = 30;

// Cal.com calls this when someone books, reschedules or cancels. Signed with HMAC-SHA256 in x-cal-signature-256.
export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifySignature(process.env.CALCOM_WEBHOOK_SECRET, raw, request.headers.get("x-cal-signature-256"))) {
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }

  let body: CalWebhook;
  try {
    body = JSON.parse(raw) as CalWebhook;
  } catch {
    return Response.json({ error: "unreadable payload" }, { status: 400 });
  }

  try {
    let crm: HubSpot | undefined;
    let stageBooked: string | undefined;
    try {
      const env = hubspotEnvFromProcess();
      crm = new HubSpot(env);
      stageBooked = env.stageBooked;
    } catch {
      // HubSpot not configured yet: still record the booking.
    }
    const result = await handleBooking(body, { notify: new PgNotifyStore(), tg: new HttpTelegram(), env: routerEnvFromProcess(), crm, stageBooked });
    return Response.json({ ok: true, ...result });
  } catch (e) {
    // Answer 500 so Cal.com retries; the booking row is already saved, so a retry is safe (idempotent upsert).
    console.error("cal.com webhook failed:", e instanceof Error ? e.message : e);
    return Response.json({ error: "processing failed" }, { status: 500 });
  }
}
