import { after } from "next/server";
import { productionPipelineDeps } from "@/lib/notify/wire";
import { processCallEnded } from "@/lib/pipeline/process-call";
import { handleVaaniWebhook, verifyToken, type VaaniBody } from "@/lib/voice/vaani";
import { PgVaaniSessions } from "@/lib/voice/vaani-sessions";

export const maxDuration = 60;

// Vaani posts every call event here. The address is registered in Vaani's dashboard as
//   https://<app>/api/webhooks/vaani/events?token=<VAANI_WEBHOOK_SECRET>
// because Vaani does not sign its requests. We answer 200 straight away and do the work afterwards.
export async function POST(request: Request) {
  if (!verifyToken(new URL(request.url).searchParams.get("token"))) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  let body: VaaniBody;
  try {
    body = (await request.json()) as VaaniBody;
  } catch {
    return Response.json({ error: "unreadable payload" }, { status: 400 });
  }

  after(async () => {
    try {
      await handleVaaniWebhook(body, {
        sessions: new PgVaaniSessions(),
        process: async (event) => processCallEnded(event, await productionPipelineDeps()),
      });
    } catch (e) {
      // The pipeline already logged and marked the call failed; Milestone 7 adds retries and a last-resort alert.
      console.error("vaani event failed:", e instanceof Error ? e.message : e);
    }
  });
  return Response.json({ received: true });
}
