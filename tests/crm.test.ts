import { beforeEach, describe, expect, it } from "vitest";
import { extractPhone, handleBooking, type CalWebhook } from "../src/lib/calcom/bookings";
import type { Crm } from "../src/lib/crm/hubspot";
import { syncToCrm } from "../src/lib/crm/sync";
import { makeRouter } from "../src/lib/notify/router";
import { MemoryNotifyStore } from "../src/lib/notify/store-memory";
import type { PipelineResult } from "../src/lib/pipeline/store";
import type { SendOptions, TelegramClient } from "../src/lib/telegram/client";
import { cfg, event } from "./helpers";

const DESIGNERS = "-100111";
const FRONTDESK = "-100222";
const env = { designersChatId: DESIGNERS, frontDeskChatId: FRONTDESK, calcomUrl: "https://cal.com/test/consult" };
const NOW = new Date("2026-09-02T05:00:00Z");
const PHONE = "+915000000001";

class FakeTelegram implements TelegramClient {
  sent: { chat: string | number; text: string }[] = [];
  async sendMessage(chat: string | number, text: string, _opts?: SendOptions) { void _opts; this.sent.push({ chat, text }); return { message_id: this.sent.length }; }
  async editMessageText() {}
  async answerCallbackQuery() {}
  to(chat: string) { return this.sent.filter((m) => String(m.chat) === chat); }
}

class FakeCrm implements Crm {
  contacts: { phone: string; name: string | null; knownId: string | null }[] = [];
  deals: { name: string; description: string; contactId: string }[] = [];
  moves: { dealId: string; stage: string }[] = [];
  failWith: string | null = null;
  async upsertContact(a: { phone: string; name: string | null; knownId: string | null }) {
    if (this.failWith) throw new Error(this.failWith);
    this.contacts.push(a);
    return a.knownId ?? `contact-${this.contacts.length}`;
  }
  async createDeal(a: { name: string; description: string; contactId: string }) { this.deals.push(a); return `deal-${this.deals.length}`; }
  async moveDeal(dealId: string, stage: string) { this.moves.push({ dealId, stage }); }
}

let tg: FakeTelegram;
let notify: MemoryNotifyStore;
let crm: FakeCrm;

const result = (over: Partial<PipelineResult> = {}): PipelineResult => ({
  duplicate: false, callId: "c1", enquiryId: "e1", category: "qualified", escalation: null,
  handoffNote: "New qualified enquiry · score 8/10", alreadyHandedOff: false,
  context: { callerId: "k1", name: "Priya Shah", reasons: [], summary: null, dealName: "Priya Shah · Kothrud · 1400 sq ft", transcriptUrl: "https://x/t/1", usesTelegram: null },
  ...over,
});

beforeEach(() => {
  tg = new FakeTelegram();
  notify = new MemoryNotifyStore();
  crm = new FakeCrm();
  notify.enquiries.set("e1", { enquiryId: "e1", callerId: "k1", phone: PHONE, name: "Priya Shah", qualified: true, createdAt: NOW });
  notify.callerCrm.set("k1", { name: null, phone: PHONE, hubspotContactId: null });
});

describe("HubSpot sync", () => {
  it("creates a contact and a deal for a qualified caller, once", async () => {
    await syncToCrm({ crm, notify }, result());
    await syncToCrm({ crm, notify }, result());
    expect(crm.contacts[0]).toMatchObject({ phone: PHONE, name: "Priya Shah" });
    expect(crm.deals).toHaveLength(1);
    expect(crm.deals[0].name).toBe("Priya Shah · Kothrud · 1400 sq ft");
    expect(crm.deals[0].description).toMatch(/New qualified enquiry/);
    expect(notify.callerCrm.get("k1")!.hubspotContactId).toBe("contact-1");
    expect(crm.contacts[1].knownId).toBe("contact-1"); // second run reuses the saved contact
  });

  it("creates only a contact for an unqualified or unsure caller", async () => {
    await syncToCrm({ crm, notify }, result({ category: "not_qualified", handoffNote: null }));
    await syncToCrm({ crm, notify }, result({ category: "unsure", handoffNote: null }));
    expect(crm.contacts.length).toBeGreaterThan(0);
    expect(crm.deals).toHaveLength(0);
  });

  it("ignores duplicate webhooks", async () => {
    await syncToCrm({ crm, notify }, result({ duplicate: true }));
    expect(crm.contacts).toHaveLength(0);
  });
});

describe("router with HubSpot", () => {
  const router = () => makeRouter({ tg, notify, cfg, env, crm, now: () => NOW });
  const ctx = { event: event(), callerPhone: PHONE };

  it("sends the Telegram handoff and creates the deal", async () => {
    await router()(result(), ctx);
    expect(tg.to(DESIGNERS)).toHaveLength(1);
    expect(crm.deals).toHaveLength(1);
  });

  it("still sends the handoff when HubSpot is down, and tells the front desk (nothing is lost silently)", async () => {
    crm.failWith = "HTTP 503";
    await expect(router()(result(), ctx)).rejects.toThrow(/503/);
    expect(tg.to(DESIGNERS)).toHaveLength(1);
    expect(tg.to(FRONTDESK)[0].text).toMatch(/HubSpot sync failed/);
  });
});

describe("Cal.com bookings", () => {
  const booking = (over: Partial<CalWebhook> = {}, uid = "bk1"): CalWebhook => ({
    triggerEvent: "BOOKING_CREATED",
    payload: { uid, startTime: "2026-10-12T05:00:00Z", attendees: [{ name: "Priya", email: "p@example.com" }], responses: { attendeePhoneNumber: { value: "+91 50000 00001" } } },
    ...over,
  });
  const run = (b: CalWebhook) => handleBooking(b, { notify, tg, env, crm, stageBooked: "stage-booked", now: () => NOW });

  beforeEach(() => { notify.deals.set("e1", "deal-9"); });

  it("records the booking, tells the designers, and moves the deal to Meeting booked", async () => {
    const r = await run(booking());
    expect(r).toEqual({ handled: true, matched: true });
    expect(notify.bookingRows[0]).toMatchObject({ calBookingId: "bk1", enquiryId: "e1", status: "booked", attendeePhone: PHONE });
    expect(tg.to(DESIGNERS)[0].text).toMatch(/Consultation booked/);
    expect(crm.moves).toEqual([{ dealId: "deal-9", stage: "stage-booked" }]);
  });

  it("is safe to receive twice (Cal.com retries)", async () => {
    await run(booking());
    await run(booking());
    expect(notify.bookingRows).toHaveLength(1);
  });

  it("alerts the front desk when the booking cannot be tied to an enquiry", async () => {
    const b = booking();
    b.payload!.responses = { attendeePhoneNumber: { value: "+91 88888 88888" } };
    const r = await run(b);
    expect(r.matched).toBe(false);
    expect(notify.bookingRows[0].enquiryId).toBeNull();
    expect(tg.to(FRONTDESK)[0].text).toMatch(/cannot match/);
    expect(crm.moves).toHaveLength(0);
  });

  it("records a cancellation", async () => {
    await run(booking());
    await run(booking({ triggerEvent: "BOOKING_CANCELLED" }));
    expect(notify.bookingRows[0].status).toBe("cancelled");
    expect(tg.to(DESIGNERS).at(-1)?.text).toMatch(/cancelled/);
  });

  it("ignores events we do not handle", async () => {
    expect(await run(booking({ triggerEvent: "MEETING_ENDED" }))).toEqual({ handled: false });
  });

  it("finds the phone number wherever Cal.com puts it", () => {
    expect(extractPhone({ responses: { attendeePhoneNumber: { value: "+915000000001" } } })).toBe(PHONE);
    expect(extractPhone({ attendees: [{ phoneNumber: "+915000000001" }] })).toBe(PHONE);
    expect(extractPhone({ responses: {} })).toBeNull();
  });
});
