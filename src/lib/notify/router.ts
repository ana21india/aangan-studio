import { randomBytes } from "node:crypto";
import { bookingLink } from "../booking";
import type { AppConfig } from "../config-defaults";
import { formatIst, isInHours, nextOfficeOpen } from "../pipeline/hours";
import type { PipelineResult } from "../pipeline/store";
import type { CallEndedEvent } from "../voice/types";
import type { TelegramClient } from "../telegram/client";
import type { Crm } from "../crm/hubspot";
import { syncToCrm } from "../crm/sync";
import { bookedButNotQualifiedAlert, crmFailureAlert, frontDeskAlert, noTelegramAlert } from "./messages";
import type { AttachedBooking } from "./store";
import type { NotifyStore } from "./store";

export interface RouterEnv {
  designersChatId: string;
  frontDeskChatId: string;
  calcomUrl?: string;
  hubspotStageBooked?: string;
}

export function routerEnvFromProcess(): RouterEnv {
  const d = process.env.TELEGRAM_DESIGNERS_CHAT_ID;
  const f = process.env.TELEGRAM_FRONTDESK_CHAT_ID;
  if (!d || !f) throw new Error("TELEGRAM_DESIGNERS_CHAT_ID and TELEGRAM_FRONTDESK_CHAT_ID must be set");
  return { designersChatId: d, frontDeskChatId: f, calcomUrl: process.env.CALCOM_BOOKING_URL, hubspotStageBooked: process.env.HUBSPOT_STAGE_BOOKED };
}

// Output step for the phone pipeline (Telegram part). HubSpot is added in Milestone 4.
//   Qualified          -> designers' group (Accept button) + booking-link flow for the caller
//   Unsure / escalated -> front-desk chat
//   Not qualified      -> nothing (the agent already closed politely)
export function makeRouter(deps: { tg: TelegramClient; notify: NotifyStore; cfg: AppConfig; env: RouterEnv; crm?: Crm; now?: () => Date }) {
  const { tg, notify, cfg, env, crm } = deps;
  const now = deps.now ?? (() => new Date());

  return async function route(result: PipelineResult, ctx: { event: CallEndedEvent; callerPhone: string }) {
    if (result.duplicate || !result.context) return;
    // A consultation the agent booked during the call is waiting for this enquiry: attach it first, so both the
    // designer message and the HubSpot deal know the meeting is already booked.
    let booking: AttachedBooking | null = null;
    if (result.enquiryId) {
      booking = await notify.attachPendingBooking(result.enquiryId, ctx.callerPhone, new Date(now().getTime() - 6 * 3600_000));
    }
    // Telegram and HubSpot are independent: one failing must not stop the other, and nothing fails silently.
    const outcomes = await Promise.allSettled([
      telegramPart(result, ctx, booking),
      crm ? crmPart(result, ctx, booking) : Promise.resolve(),
    ]);
    const failures = outcomes.flatMap((o) => (o.status === "rejected" ? [o.reason instanceof Error ? o.reason.message : String(o.reason)] : []));
    if (failures.length) throw new Error(failures.join(" | "));
  };

  async function crmPart(result: PipelineResult, ctx: { event: CallEndedEvent; callerPhone: string }, booking: AttachedBooking | null) {
    try {
      await syncToCrm({ crm: crm!, notify }, result);
      if (booking && result.category === "qualified" && result.enquiryId && env.hubspotStageBooked) {
        const dealId = await notify.getEnquiryDeal(result.enquiryId);
        if (dealId) await crm!.moveDeal(dealId, env.hubspotStageBooked);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // Tell the front desk, so the contact or deal can be created by hand.
      await tg.sendMessage(env.frontDeskChatId, crmFailureAlert(result.context?.name ?? null, ctx.callerPhone, message)).catch(() => {});
      throw e;
    }
  }

  async function telegramPart(result: PipelineResult, ctx: { event: CallEndedEvent; callerPhone: string }, booking: AttachedBooking | null) {
    const { event, callerPhone } = ctx;
    const c = result.context!;
    const bookedWhen = booking?.scheduledFor ? formatIst(booking.scheduledFor) : booking ? "time to be confirmed" : null;

    // Booked, yet the scoring did not rate the enquiry as qualified: a person should look before a designer goes.
    if (booking && result.category && result.category !== "qualified") {
      await tg.sendMessage(env.frontDeskChatId, bookedButNotQualifiedAlert(c.name, callerPhone, bookedWhen!, result.category));
    }

    if (result.escalation) {
      await tg.sendMessage(
        env.frontDeskChatId,
        frontDeskAlert({
          reason: result.escalation.reason,
          urgent: result.escalation.urgent,
          name: c.name,
          phone: callerPhone,
          at: formatIst(event.startedAt),
          reasons: c.reasons,
          summary: c.summary,
          transcriptUrl: c.transcriptUrl,
        }),
      );
    }

    if (result.category === "qualified" && result.enquiryId && result.handoffNote && !result.alreadyHandedOff) {
      const handoffId = await notify.createHandoff(result.enquiryId);
      const note = bookedWhen ? `${result.handoffNote}
📅 Consultation already booked: ${bookedWhen}` : result.handoffNote;
      const sent = await tg.sendMessage(env.designersChatId, note, {
        inlineKeyboard: [[{ text: "Accept", callback_data: `accept:${handoffId}` }]],
      });
      await notify.setHandoffMessage(handoffId, sent.message_id);

      // Already booked during the call: no booking-link steps are needed.
      if (booking) return;

      // Otherwise the caller can still get a booking link on Telegram once they press Start (DECISIONS.md D-004).
      const t = now();
      const skipBot = c.usesTelegram === false;
      const nudgeDue = skipBot ? null : isInHours(t, cfg.OFFICE_HOURS_START, cfg.OFFICE_HOURS_END)
        ? new Date(t.getTime() + cfg.TELEGRAM_NUDGE_MINUTES * 60_000)
        : nextOfficeOpen(t, cfg.OFFICE_HOURS_START, cfg.OFFICE_HOURS_END);
      const morningBase = new Date((nudgeDue ?? t).getTime() + 20 * 3600_000);
      await notify.createTelegramLink({
        enquiryId: result.enquiryId,
        callerId: c.callerId,
        token: randomBytes(18).toString("base64url"),
        nudgeDueAt: nudgeDue,
        morningDueAt: nextOfficeOpen(morningBase, cfg.OFFICE_HOURS_START, cfg.OFFICE_HOURS_END),
      });

      if (skipBot) {
        await tg.sendMessage(env.frontDeskChatId, noTelegramAlert(c.name, callerPhone, bookingLink(c.name, callerPhone, env.calcomUrl)));
      }
    }
  }
}
