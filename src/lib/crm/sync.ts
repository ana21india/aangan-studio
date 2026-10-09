import type { NotifyStore } from "../notify/store";
import type { PipelineResult } from "../pipeline/store";
import type { Crm } from "./hubspot";

// Every caller becomes a HubSpot contact. Qualified callers also get a deal (once per enquiry).
// Not-qualified and unsure callers get a contact only. A failure here must never block the Telegram handoff;
// the router catches it and alerts the front desk.
export async function syncToCrm(deps: { crm: Crm; notify: NotifyStore }, result: PipelineResult): Promise<void> {
  const { crm, notify } = deps;
  const c = result.context;
  if (result.duplicate || !c) return;

  const caller = await notify.getCallerCrm(c.callerId);
  if (!caller) throw new Error(`Caller ${c.callerId} not found for HubSpot sync`);

  const contactId = await crm.upsertContact({
    phone: caller.phone,
    name: c.name ?? caller.name,
    knownId: caller.hubspotContactId,
  });
  if (contactId !== caller.hubspotContactId) await notify.setCallerContact(c.callerId, contactId);

  if (result.category === "qualified" && result.enquiryId && result.handoffNote) {
    if (await notify.getEnquiryDeal(result.enquiryId)) return; // already has a deal
    const dealId = await crm.createDeal({ name: c.dealName, description: result.handoffNote, contactId });
    await notify.setEnquiryDeal(result.enquiryId, dealId);
  }
}
