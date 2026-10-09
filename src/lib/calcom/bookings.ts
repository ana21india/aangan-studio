import type { Crm } from "../crm/hubspot";
import { bookingAlert, bookingCancelledAlert, bookingUnmatchedAlert } from "../notify/messages";
import type { RouterEnv } from "../notify/router";
import type { NotifyStore } from "../notify/store";
import { formatIst } from "../pipeline/hours";
import type { TelegramClient } from "../telegram/client";
import { normalisePhone } from "../telegram/handlers";

// Cal.com booking webhook body. Field names follow Cal.com's docs; confirmed against a real booking in Milestone 4.
export interface CalWebhook {
  triggerEvent: string;
  payload?: {
    uid?: string;
    startTime?: string;
    attendees?: { name?: string; email?: string; phoneNumber?: string }[];
    responses?: Record<string, { value?: unknown } | undefined>;
  };
}

const CLAIM_WINDOW_DAYS = 30;

export function extractPhone(p: NonNullable<CalWebhook["payload"]>): string | null {
  const fromResponses = [p.responses?.attendeePhoneNumber?.value, p.responses?.phone?.value, p.responses?.phoneNumber?.value]
    .find((v) => typeof v === "string" && v.replace(/\D/g, "").length >= 10);
  const raw = (fromResponses as string | undefined) ?? p.attendees?.[0]?.phoneNumber;
  return raw ? normalisePhone(raw) : null;
}

// Records the booking, tells the designers, and moves the HubSpot deal to "Meeting booked".
export async function handleBooking(
  body: CalWebhook,
  deps: { notify: NotifyStore; tg: TelegramClient; env: RouterEnv; crm?: Crm; stageBooked?: string; now?: () => Date },
): Promise<{ handled: boolean; matched?: boolean }> {
  const { notify, tg, env, crm } = deps;
  const now = deps.now ?? (() => new Date());
  const p = body.payload;
  const supported = ["BOOKING_CREATED", "BOOKING_RESCHEDULED", "BOOKING_CANCELLED"];
  if (!p?.uid || !supported.includes(body.triggerEvent)) return { handled: false };

  const phone = extractPhone(p);
  const name = p.attendees?.[0]?.name ?? null;
  const start = p.startTime ? new Date(p.startTime) : null;
  const when = start ? formatIst(start) : "time unknown";
  const cancelled = body.triggerEvent === "BOOKING_CANCELLED";

  const enquiry = phone
    ? await notify.findLatestQualifiedByPhoneForBooking(phone, new Date(now().getTime() - CLAIM_WINDOW_DAYS * 86_400_000))
    : null;

  await notify.upsertBooking({
    calBookingId: p.uid,
    enquiryId: enquiry?.enquiryId ?? null,
    scheduledFor: start,
    status: cancelled ? "cancelled" : "booked",
    attendeeName: name,
    attendeePhone: phone,
  });

  if (cancelled) {
    await tg.sendMessage(env.designersChatId, bookingCancelledAlert(enquiry?.name ?? name, phone, when));
    return { handled: true, matched: !!enquiry };
  }

  if (!enquiry) {
    // Never lose a booking: someone booked with a number we cannot tie to an enquiry.
    await tg.sendMessage(env.frontDeskChatId, bookingUnmatchedAlert(name, phone, when));
    return { handled: true, matched: false };
  }

  await tg.sendMessage(env.designersChatId, bookingAlert(enquiry.name ?? name, phone, when));
  if (crm && deps.stageBooked && enquiry.dealId) {
    try {
      await crm.moveDeal(enquiry.dealId, deps.stageBooked);
    } catch (e) {
      await tg.sendMessage(env.frontDeskChatId, `🧩 Could not move the HubSpot deal to "Meeting booked" for ${enquiry.name ?? phone}. Please move it by hand.\n${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`).catch(() => {});
      throw e;
    }
  }
  return { handled: true, matched: true };
}
