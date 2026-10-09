// Minimal HubSpot client (private-app token). Supabase/Neon stays the source of truth; HubSpot is synced from it.
// Scopes needed: crm.objects.contacts.read/write and crm.objects.deals.read/write.
export interface Crm {
  /** Finds the contact by phone (or uses the known id), creates it if missing, and returns its id. */
  upsertContact(a: { phone: string; name: string | null; knownId: string | null }): Promise<string>;
  createDeal(a: { name: string; description: string; contactId: string }): Promise<string>;
  moveDeal(dealId: string, stageId: string): Promise<void>;
}

export interface HubSpotEnv {
  token: string;
  pipelineId: string;
  stageNew: string;
  stageBooked: string;
}

export function hubspotEnvFromProcess(): HubSpotEnv {
  const e = process.env;
  const need = { HUBSPOT_PRIVATE_APP_TOKEN: e.HUBSPOT_PRIVATE_APP_TOKEN, HUBSPOT_PIPELINE_ID: e.HUBSPOT_PIPELINE_ID, HUBSPOT_STAGE_NEW: e.HUBSPOT_STAGE_NEW, HUBSPOT_STAGE_BOOKED: e.HUBSPOT_STAGE_BOOKED };
  const missing = Object.entries(need).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`Missing HubSpot settings: ${missing.join(", ")}`);
  return { token: need.HUBSPOT_PRIVATE_APP_TOKEN!, pipelineId: need.HUBSPOT_PIPELINE_ID!, stageNew: need.HUBSPOT_STAGE_NEW!, stageBooked: need.HUBSPOT_STAGE_BOOKED! };
}

const BASE = "https://api.hubapi.com";

export class HubSpot implements Crm {
  constructor(private readonly env: HubSpotEnv = hubspotEnvFromProcess()) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let lastError = "";
    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { authorization: `Bearer ${this.env.token}`, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.ok) return (res.status === 204 ? {} : await res.json()) as T;
      lastError = `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`;
      if (res.status !== 429 && res.status < 500) break; // retrying a 4xx never helps
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
    throw new Error(`HubSpot ${method} ${path} failed. ${lastError}`);
  }

  async upsertContact({ phone, name, knownId }: { phone: string; name: string | null; knownId: string | null }) {
    const [first, ...rest] = (name ?? "").trim().split(/\s+/).filter(Boolean);
    const nameProps = first ? { firstname: first, ...(rest.length ? { lastname: rest.join(" ") } : {}) } : {};

    let id = knownId;
    if (!id) {
      const found = await this.call<{ results: { id: string }[] }>("POST", "/crm/v3/objects/contacts/search", {
        filterGroups: [{ filters: [{ propertyName: "phone", operator: "EQ", value: phone }] }],
        properties: ["phone", "firstname"],
        limit: 1,
      });
      id = found.results[0]?.id ?? null;
    }
    if (!id) {
      const created = await this.call<{ id: string }>("POST", "/crm/v3/objects/contacts", { properties: { phone, ...nameProps } });
      return created.id;
    }
    if (first) await this.call("PATCH", `/crm/v3/objects/contacts/${id}`, { properties: nameProps });
    return id;
  }

  async createDeal({ name, description, contactId }: { name: string; description: string; contactId: string }) {
    const deal = await this.call<{ id: string }>("POST", "/crm/v3/objects/deals", {
      properties: { dealname: name, pipeline: this.env.pipelineId, dealstage: this.env.stageNew, description },
      associations: [{ to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }] }],
    });
    return deal.id;
  }

  async moveDeal(dealId: string, stageId: string) {
    await this.call("PATCH", `/crm/v3/objects/deals/${dealId}`, { properties: { dealstage: stageId } });
  }

  /** Used once during setup to look up pipeline and stage ids. */
  async listDealPipelines() {
    return this.call<{ results: { id: string; label: string; stages: { id: string; label: string }[] }[] }>("GET", "/crm/v3/pipelines/deals");
  }
}
