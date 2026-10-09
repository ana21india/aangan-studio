import { after } from "next/server";
import { productionPipelineDeps } from "@/lib/notify/wire";
import { processCallEnded } from "@/lib/pipeline/process-call";
import { getVoiceProvider } from "@/lib/voice";

// Gemini calls take a few seconds; the provider expects a quick reply, so we acknowledge first and process after.
export const maxDuration = 60;

export async function POST(request: Request) {
  const raw = await request.text();
  const provider = getVoiceProvider();

  // 1. Verify: anything unsigned or wrongly signed is rejected.
  if (!provider.verifyWebhook(raw, request.headers)) {
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }

  let event;
  try {
    event = provider.parseCallEnded(raw);
  } catch {
    return Response.json({ error: "unreadable payload" }, { status: 400 });
  }

  // 2-7 run after the response. Duplicates are detected inside (idempotent on provider_call_id).
  after(async () => {
    try {
      await processCallEnded(event, await productionPipelineDeps());
    } catch {
      // Already logged and marked failed inside the pipeline. Milestone 7 adds retries and a front-desk alert.
    }
  });

  return Response.json({ received: true });
}
