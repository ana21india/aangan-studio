import { bookingLink, startLink } from "../booking";
import type { AppConfig } from "../config-defaults";
import { formatIst, isInHours } from "../pipeline/hours";
import type { TelegramClient } from "../telegram/client";
import { bookingUnmatchedAlert, morningAlert, nudgeAlert, overdueAlert, staleCallbackAlert } from "./messages";
import type { RouterEnv } from "./router";
import type { NotifyStore } from "./store";

export interface FollowupSummary {
  nudges: number;
  mornings: number;
  overdue: number;
  staleCallbacks: number;
  unmatchedBookings: number;
  errors: string[];
}

// Runs every few minutes (GitHub Actions calls /api/cron/followups). Each reminder is marked as sent
// in the database first-class, so it fires once even if two runs overlap or one run fails halfway.
export async function runFollowups(deps: {
  notify: NotifyStore;
  tg: TelegramClient;
  cfg: AppConfig;
  env: RouterEnv;
  botUsername: string;
  now?: Date;
}): Promise<FollowupSummary> {
  const { notify, tg, cfg, env, botUsername } = deps;
  const now = deps.now ?? new Date();
  const out: FollowupSummary = { nudges: 0, mornings: 0, overdue: 0, staleCallbacks: 0, unmatchedBookings: 0, errors: [] };
  const guard = async (label: string, fn: () => Promise<void>) => {
    try { await fn(); } catch (e) { out.errors.push(`${label}: ${e instanceof Error ? e.message : e}`); }
  };

  for (const l of await notify.dueNudges(now)) {
    await guard(`nudge ${l.id}`, async () => {
      await notify.markNudged(l.id); // mark first: a missed alert is recoverable by the morning reminder, a repeat is just noise
      await tg.sendMessage(env.frontDeskChatId, nudgeAlert(l.name, l.phone, startLink(botUsername, l.token), bookingLink(l.name, l.phone, env.calcomUrl)));
      out.nudges++;
    });
  }

  for (const l of await notify.dueMorning(now)) {
    await guard(`morning ${l.id}`, async () => {
      await notify.markMorningSent(l.id);
      await tg.sendMessage(env.frontDeskChatId, morningAlert(l.name, l.phone, bookingLink(l.name, l.phone, env.calcomUrl)));
      out.mornings++;
    });
  }

  // Overdue handoffs are only chased during office hours.
  if (isInHours(now, cfg.OFFICE_HOURS_START, cfg.OFFICE_HOURS_END)) {
    const cutoff = new Date(now.getTime() - cfg.OVERDUE_HANDOFF_MINUTES * 60_000);
    for (const h of await notify.overdueHandoffs(cutoff)) {
      await guard(`overdue ${h.id}`, async () => {
        await notify.markOverdueAlerted(h.id);
        const text = overdueAlert(h.name, h.phone, cfg.OVERDUE_HANDOFF_MINUTES);
        await tg.sendMessage(env.frontDeskChatId, text);
        await tg.sendMessage(env.designersChatId, text);
        out.overdue++;
      });
    }
  }

  const staleCutoff = new Date(now.getTime() - 24 * 3600_000);
  for (const s of await notify.staleEscalations(staleCutoff)) {
    await guard(`stale ${s.id}`, async () => {
      await notify.markEscalationRealerted(s.id);
      await tg.sendMessage(env.frontDeskChatId, staleCallbackAlert(s.reason, s.name, s.phone));
      out.staleCallbacks++;
    });
  }

  // A booking still not tied to any enquiry 30 minutes after it was made: tell the front desk once.
  for (const b of await notify.unmatchedBookingsDue(new Date(now.getTime() - 30 * 60_000))) {
    await guard(`booking ${b.id}`, async () => {
      await notify.markBookingAlerted(b.id);
      await tg.sendMessage(env.frontDeskChatId, bookingUnmatchedAlert(b.name, b.phone, b.scheduledFor ? formatIst(b.scheduledFor) : "time unknown"));
      out.unmatchedBookings++;
    });
  }
  return out;
}
