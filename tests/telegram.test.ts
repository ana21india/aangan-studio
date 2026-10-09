import { beforeEach, describe, expect, it } from "vitest";
import { runFollowups } from "../src/lib/notify/followups";
import { makeRouter } from "../src/lib/notify/router";
import { MemoryNotifyStore } from "../src/lib/notify/store-memory";
import { nextOfficeOpen } from "../src/lib/pipeline/hours";
import type { PipelineResult } from "../src/lib/pipeline/store";
import type { SendOptions, TelegramClient } from "../src/lib/telegram/client";
import { handleUpdate, normalisePhone } from "../src/lib/telegram/handlers";
import { cfg, event } from "./helpers";

const DESIGNERS = "-100111";
const FRONTDESK = "-100222";
const env = { designersChatId: DESIGNERS, frontDeskChatId: FRONTDESK, calcomUrl: "https://cal.com/test/consult" };

class FakeTelegram implements TelegramClient {
  sent: { chat: string | number; text: string; opts?: SendOptions; id: number }[] = [];
  edits: { chat: string | number; id: number; text: string }[] = [];
  answers: { id: string; text?: string }[] = [];
  async sendMessage(chat: string | number, text: string, opts?: SendOptions) {
    const id = this.sent.length + 100;
    this.sent.push({ chat, text, opts, id });
    return { message_id: id };
  }
  async editMessageText(chat: string | number, id: number, text: string) { this.edits.push({ chat, id, text }); }
  async answerCallbackQuery(id: string, text?: string) { this.answers.push({ id, text }); }
  to(chat: string) { return this.sent.filter((m) => String(m.chat) === chat); }
}

let tg: FakeTelegram;
let notify: MemoryNotifyStore;
const NOW = new Date("2026-09-02T05:00:00Z"); // 10:30 IST, in hours

const qualified = (over: Partial<PipelineResult> = {}): PipelineResult => ({
  duplicate: false, callId: "c1", enquiryId: "e1", category: "qualified", escalation: null,
  handoffNote: "New qualified enquiry · score 8/10\nName: Priya", alreadyHandedOff: false,
  context: { callerId: "k1", name: "Priya Shah", reasons: ["Real project: ok"], summary: "Wants a call from a senior person", transcriptUrl: "https://x/t/1", usesTelegram: null },
  ...over,
});

beforeEach(() => {
  tg = new FakeTelegram();
  notify = new MemoryNotifyStore();
  notify.enquiries.set("e1", { enquiryId: "e1", callerId: "k1", phone: "+919000000001", name: "Priya Shah", qualified: true, createdAt: NOW });
});

const router = () => makeRouter({ tg, notify, cfg, env, now: () => NOW });
const ctx = { event: event(), callerPhone: "+919000000001" };

describe("routing", () => {
  it("posts a qualified handoff to the designers with an Accept button", async () => {
    await router()(qualified(), ctx);
    const posted = tg.to(DESIGNERS);
    expect(posted).toHaveLength(1);
    expect(posted[0].text).toMatch(/New qualified enquiry/);
    expect(posted[0].opts?.inlineKeyboard?.[0][0].callback_data).toBe("accept:h1");
    expect(notify.handoffs[0].messageId).toBe(posted[0].id);
    expect(notify.links).toHaveLength(1);
    expect(tg.to(FRONTDESK)).toHaveLength(0);
  });

  it("never sends a second handoff for the same enquiry", async () => {
    await router()(qualified({ alreadyHandedOff: true }), ctx);
    await router()(qualified({ duplicate: true }), ctx);
    expect(tg.to(DESIGNERS)).toHaveLength(0);
  });

  it("sends nothing for a not-qualified enquiry", async () => {
    await router()(qualified({ category: "not_qualified", handoffNote: null }), ctx);
    expect(tg.sent).toHaveLength(0);
  });

  it("alerts the front desk urgently for a complaint (T09)", async () => {
    await router()(qualified({ category: "unsure", handoffNote: null, escalation: { reason: "complaint", urgent: true } }), ctx);
    expect(tg.to(DESIGNERS)).toHaveLength(0);
    expect(tg.to(FRONTDESK)[0].text).toMatch(/^🚨 URGENT/);
    expect(tg.to(FRONTDESK)[0].text).toContain("+919000000001");
  });

  it("asks the front desk to call back after a missed call (T08), with no transcript link", async () => {
    await router()(qualified({ category: "unsure", handoffNote: null, escalation: { reason: "missed_call", urgent: false } }), ctx);
    expect(tg.to(FRONTDESK)[0].text).toMatch(/Missed call/);
    expect(tg.to(FRONTDESK)[0].text).not.toMatch(/Transcript/);
  });

  it("shows what the caller said, not the lead-scoring criteria, for a complaint", async () => {
    await router()(qualified({ category: "unsure", handoffNote: null, escalation: { reason: "complaint", urgent: true } }), ctx);
    const text = tg.to(FRONTDESK)[0].text;
    expect(text).toMatch(/What they said: Wants a call from a senior person/);
    expect(text).not.toMatch(/Real project/);
  });

  it("gives the front desk the booking link at once if the caller does not use Telegram (D-004)", async () => {
    const r = qualified();
    r.context!.usesTelegram = false;
    await router()(r, ctx);
    const alert = tg.to(FRONTDESK)[0].text;
    expect(alert).toMatch(/does not use Telegram/);
    expect(alert).toContain("https://cal.com/test/consult?name=Priya+Shah&attendeePhoneNumber=%2B919000000001");
    expect(notify.links[0].nudgeDueAt).toBeNull();
  });
});

describe("Accept button", () => {
  const press = (userId: number, name: string, username?: string) => ({
    update_id: 1,
    callback_query: {
      id: `cb${userId}`, from: { id: userId, first_name: name, username }, data: "accept:h1",
      message: { message_id: 100, chat: { id: Number(DESIGNERS) }, text: "New qualified enquiry" },
    },
  });

  beforeEach(async () => { await router()(qualified(), ctx); });

  it("records who accepted and edits the message to show it", async () => {
    await handleUpdate(press(7, "Asha", "asha_d"), { tg, notify, env, now: () => NOW });
    expect(notify.handoffs[0].by).toBe("@asha_d");
    expect(tg.edits[0].text).toMatch(/Accepted by @asha_d/);
  });

  it("tells a second designer it is already taken", async () => {
    await handleUpdate(press(7, "Asha", "asha_d"), { tg, notify, env, now: () => NOW });
    await handleUpdate(press(8, "Ravi"), { tg, notify, env, now: () => NOW });
    expect(tg.edits).toHaveLength(1);
    expect(tg.answers.at(-1)?.text).toMatch(/Already accepted by @asha_d/);
  });

  it("ignores Accept taps from any chat other than the designers' group", async () => {
    const u = press(9, "Eve");
    u.callback_query.message.chat.id = 555;
    await handleUpdate(u, { tg, notify, env, now: () => NOW });
    expect(notify.handoffs[0].by).toBeUndefined();
  });
});

describe("caller talking to the bot (D-004)", () => {
  const msg = (extra: object) => ({ update_id: 2, message: { message_id: 1, chat: { id: 900, type: "private" }, from: { id: 900, first_name: "Priya" }, ...extra } });

  beforeEach(async () => { await router()(qualified(), ctx); });

  it("asks for their phone number when they press Start", async () => {
    await handleUpdate(msg({ text: "/start" }), { tg, notify, env, now: () => NOW });
    expect(tg.to("900")[0].opts?.requestContactButton).toBeTruthy();
  });

  it("sends the Cal.com link after they share their own number", async () => {
    await handleUpdate(msg({ contact: { phone_number: "919000000001", user_id: 900 } }), { tg, notify, env, now: () => NOW });
    expect(tg.to("900")[0].text).toContain("https://cal.com/test/consult");
    expect(notify.links[0].linkSentAt).not.toBeNull();
    expect(notify.links[0].started).toBe(true);
  });

  it("refuses a forwarded contact that is not the sender's own number", async () => {
    await handleUpdate(msg({ contact: { phone_number: "919000000001", user_id: 12345 } }), { tg, notify, env, now: () => NOW });
    expect(tg.to("900")[0].text).toMatch(/your own number/);
    expect(notify.links[0].linkSentAt).toBeNull();
  });

  it("alerts the front desk when the number matches no recent qualified enquiry", async () => {
    await handleUpdate(msg({ contact: { phone_number: "918888888888", user_id: 900 } }), { tg, notify, env, now: () => NOW });
    expect(tg.to("900")[0].text).toMatch(/front desk/);
    expect(tg.to(FRONTDESK)[0].text).toMatch(/could not match/);
  });

  it("works from the personal link the front desk can forward", async () => {
    const token = notify.links[0].token;
    await handleUpdate(msg({ text: `/start ${token}` }), { tg, notify, env, now: () => NOW });
    expect(tg.to("900")[0].text).toContain("cal.com");
    expect(notify.links[0].linkSentAt).not.toBeNull();
  });

  it("ignores group chats", async () => {
    const u = msg({ text: "/start" });
    u.message.chat.type = "group";
    await handleUpdate(u, { tg, notify, env, now: () => NOW });
    expect(tg.sent.filter((m) => m.chat === 900)).toHaveLength(0);
  });
});

describe("timed follow-ups", () => {
  const run = (at: Date) => runFollowups({ notify, tg, cfg, env, botUsername: "AanganTestBot", now: at });

  beforeEach(async () => { await router()(qualified(), ctx); tg.sent.length = 0; });

  it("nudges the front desk 10 minutes after the call if the caller has not started the bot", async () => {
    expect((await run(new Date(NOW.getTime() + 5 * 60_000))).nudges).toBe(0);
    const r = await run(new Date(NOW.getTime() + 11 * 60_000));
    expect(r.nudges).toBe(1);
    const alert = tg.to(FRONTDESK)[0].text;
    expect(alert).toMatch(/https:\/\/t\.me\/AanganTestBot\?start=/);
    expect(alert).toContain("cal.com");
  });

  it("does not nudge twice", async () => {
    await run(new Date(NOW.getTime() + 11 * 60_000));
    const r = await run(new Date(NOW.getTime() + 20 * 60_000));
    expect(r.nudges).toBe(0);
  });

  it("does not nudge a caller who already started the bot", async () => {
    notify.links[0].started = true;
    expect((await run(new Date(NOW.getTime() + 11 * 60_000))).nudges).toBe(0);
  });

  it("sends the next-morning reminder only if nothing is booked", async () => {
    const next = new Date(NOW.getTime() + 24 * 3600_000); // 10:30 next morning (due 10:00)
    notify.bookings.add("e1");
    expect((await run(next)).mornings).toBe(0);
    notify.bookings.delete("e1");
    expect((await run(next)).mornings).toBe(1);
  });

  it("re-alerts when no designer accepts within the limit, during office hours only", async () => {
    notify.handoffs[0].sentAt = new Date(NOW.getTime() - 3 * 3600_000);
    const night = new Date("2026-09-02T18:00:00Z"); // 23:30 IST
    expect((await run(night)).overdue).toBe(0);
    const r = await run(NOW);
    expect(r.overdue).toBe(1);
    expect(tg.to(DESIGNERS)).toHaveLength(1);
    expect((await run(NOW)).overdue).toBe(0);
  });

  it("re-alerts a callback that is still open after 24 hours", async () => {
    notify.stale.push({ id: "x1", reason: "missed_call", enquiryId: null, name: null, phone: "+919000000008", createdAt: new Date(NOW.getTime() - 25 * 3600_000) });
    expect((await run(NOW)).staleCallbacks).toBe(1);
    expect((await run(NOW)).staleCallbacks).toBe(0);
  });
});

describe("helpers", () => {
  it("normalises phone numbers from Telegram", () => {
    expect(normalisePhone("919000000001")).toBe("+919000000001");
    expect(normalisePhone("+91 90000 00001")).toBe("+919000000001");
    expect(normalisePhone("9000000001")).toBe("+919000000001");
  });
  it("finds the next time the office opens", () => {
    expect(nextOfficeOpen(new Date("2026-09-02T18:00:00Z")).toISOString()).toBe("2026-09-03T04:30:00.000Z"); // 23:30 IST -> 10:00 IST next day
    expect(nextOfficeOpen(new Date("2026-09-02T20:30:00Z")).toISOString()).toBe("2026-09-03T04:30:00.000Z"); // 02:00 IST -> 10:00 IST same day
    expect(nextOfficeOpen(NOW).toISOString()).toBe(NOW.toISOString());
  });
});
