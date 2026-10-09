import type { EscalationReason } from "../scoring/types";

// Plain-text messages (no markup, so nothing in a caller's name can break the formatting).
const who = (name: string | null, phone: string | null) => `${name ?? "Unknown caller"}${phone ? ` · ${phone}` : ""}`;

export const REASON_TITLE: Record<string, string> = {
  complaint: "URGENT: complaint or existing-client issue",
  asked_for_person: "Caller asked for a person",
  unsure: "Needs a human look: details unclear",
  missed_call: "Missed call: please call back",
  dropped_call: "Call dropped: please call back",
  budget_mismatch: "Budget looks well below the scope",
  decision_maker: "Caller may not be the decision-maker",
  small_commercial: "Very small commercial space",
  pipeline_failure: "System problem: enquiry may be stuck",
};

export function frontDeskAlert(a: {
  reason: EscalationReason | string;
  urgent: boolean;
  name: string | null;
  phone: string | null;
  at: string;
  reasons?: string[];
  summary?: string | null;
  transcriptUrl?: string;
}): string {
  const lines = [`${a.urgent ? "🚨 " : "⚠️ "}${REASON_TITLE[a.reason] ?? a.reason}`, `${who(a.name, a.phone)} · ${a.at}`];
  if (a.reason === "complaint") lines.push("Caller wants a call back from a senior person. Please respond right away.");
  // The criteria breakdown only helps when the question is "is this a good lead?", not for complaints or missed calls.
  if (a.summary && ["complaint", "asked_for_person"].includes(a.reason)) lines.push("", `What they said: ${a.summary}`);
  if (a.reasons?.length && ["unsure", "budget_mismatch", "decision_maker", "small_commercial"].includes(a.reason)) {
    lines.push("", ...a.reasons.map((r) => `• ${r}`));
  }
  if (a.transcriptUrl && !["missed_call", "dropped_call"].includes(a.reason)) lines.push("", `Transcript: ${a.transcriptUrl}`);
  return lines.join("\n");
}

export const noTelegramAlert = (name: string | null, phone: string, bookingUrl: string) =>
  [`📵 Caller does not use Telegram`, who(name, phone), "", "Qualified enquiry. Please send this booking link another way (call, email or WhatsApp):", bookingUrl].join("\n");

export const nudgeAlert = (name: string | null, phone: string, startUrl: string, bookingUrl: string) =>
  [`⏰ Booking link not opened yet`, who(name, phone), "",
   "They have not started the bot. Forward either link:",
   `Bot link: ${startUrl}`, `Direct booking link: ${bookingUrl}`].join("\n");

export const morningAlert = (name: string | null, phone: string, bookingUrl: string) =>
  [`☀️ Still not booked`, who(name, phone), "", "No consultation booked yet for this qualified enquiry. Please follow up.", `Booking link: ${bookingUrl}`].join("\n");

export const overdueAlert = (name: string | null, phone: string, minutes: number) =>
  [`⏳ Handoff not accepted`, who(name, phone), `No designer has accepted this qualified enquiry after ${minutes} minutes. Please assign one.`].join("\n");

export const staleCallbackAlert = (reason: string, name: string | null, phone: string | null) =>
  [`🔁 Callback still open after 24 hours`, who(name, phone), REASON_TITLE[reason] ?? reason].join("\n");

export const unmatchedContactAlert = (phone: string, telegramName: string) =>
  [`❓ Someone started the bot but we could not match them`, `${telegramName} shared ${phone}`, "No recent qualified enquiry found for that number. They may have called from a different number."].join("\n");

export const callerWelcome = "Welcome to Aangan Studio. To find your enquiry, please tap the button below to share your phone number.";

export const callerLink = (name: string | null, url: string) =>
  `${name ? `Thanks ${name.split(" ")[0]}! ` : "Thanks! "}Here is your link to book a free consultation with one of our designers:\n${url}\n\nPick any time that suits you.`;

export const callerNoMatch =
  "Thanks for getting in touch. I couldn't find a recent enquiry for that number, so I've asked our front desk to contact you directly.";

export const callerOther = "I can only send booking links here. For anything else, please call the studio during 10am to 7pm.";
