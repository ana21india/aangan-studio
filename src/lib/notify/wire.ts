import { HttpTelegram } from "../telegram/client";
import { PgStore } from "../pipeline/store-pg";
import type { PipelineDeps } from "../pipeline/process-call";
import { makeRouter, routerEnvFromProcess } from "./router";
import { PgNotifyStore } from "./store-pg";

// Production wiring: real database, real Telegram.
export async function productionPipelineDeps(): Promise<PipelineDeps> {
  const store = new PgStore();
  const cfg = await store.getConfig();
  return {
    store,
    route: makeRouter({ tg: new HttpTelegram(), notify: new PgNotifyStore(), cfg, env: routerEnvFromProcess() }),
  };
}
