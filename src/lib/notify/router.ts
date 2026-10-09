import { randomBytes } from "node:crypto";
import { bookingLink } from "../booking";
import type { AppConfig } from "../config-defaults";
import { formatIst, isInHours, nextOfficeOpen } from "../pipeline/hours";
import type { PipelineResult } from "../pipeline/store";
import type { CallEndedEvent } from "../voice/types";
import type { TelegramClient } from "../telegram/client";
import { frontDeskAlert, noTelegramAlert } from "./messages";
import type { NotifyStore } from "./store";

export interface RouterEnv {
  designersChatId: string;
  frontDeskChatId: string;
  calcomUrl?: string;
}

export function routerEnvFromProcess(): RouterEnv {
  const d = process.env.TELEGRAM_DESIGNERS_CHAT_ID;
  const f = process.env.TELEGRAM_FRONTDESK_CHAT_ID;
  if (!d || !f) throw new Error("TELEGRAM_DESIGNERS_CHAT_ID and TELEGRAM_FRONTDESK_CHAT_ID must be set");
  return { designersChatId: d, frontDeskChatId: f, calcomUrl: process.env.CALCOM_BOOKING_URL };
}

// Output step for the phone pipeline (Telegram part). HubSpot is added in Milestone 4.
//   Qualified          -> designers' group (Accept button) + booking-link flow for the caller
//   Unsure / escalated -> front-desk chat
//   Not qualified      -> nothing (the agent already closed politely)
export function makeRouter(deps: { tg: TelegramClient; notify: NotifyStore; cfg: AppConfig; env: RouterEnv; now?: () => Date }) {
  const { tg, notify, cfg, env } = deps;
  const now = deps.now ?? (() => new Date());

  return async function route(result: PipelineResult, ctx: { event: CallEndedEvent; callerPhone: string }) {
    if (result.duplicate || !result.context) return;
    const { event, callerPhone } = ctx;
    const c = result.context;

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
      const sent = await tg.sendMessage(env.designersChatId, result.handoffNote, {
        inlineKeyboard: [[{ text: "Accept", callback_data: `accept:${handoffId}` }]],
      });
      await notify.setHandoffMessage(handoffId, sent.message_id);

      // The caller gets their booking link on Telegram once they press Start (DECISIONS.md D-004).
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
  };
}
