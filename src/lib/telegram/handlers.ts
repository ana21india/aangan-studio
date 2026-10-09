import { bookingLink } from "../booking";
import { formatIst } from "../pipeline/hours";
import { callerLink, callerNoMatch, callerOther, callerWelcome, unmatchedContactAlert } from "../notify/messages";
import type { NotifyStore } from "../notify/store";
import type { RouterEnv } from "../notify/router";
import type { TelegramClient } from "./client";

interface TgUser { id: number; first_name?: string; last_name?: string; username?: string }
export interface TgUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    from?: TgUser;
    text?: string;
    contact?: { phone_number: string; first_name?: string; user_id?: number };
  };
  callback_query?: {
    id: string;
    from: TgUser;
    data?: string;
    message?: { message_id: number; chat: { id: number }; text?: string };
  };
}

const displayName = (u: TgUser) => (u.username ? `@${u.username}` : [u.first_name, u.last_name].filter(Boolean).join(" ") || `user ${u.id}`);

export function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.length === 10 ? `+91${digits}` : `+${digits}`;
}

// How long after a call the caller can still claim their booking link by sharing their number.
const CLAIM_WINDOW_DAYS = 14;

export async function handleUpdate(
  update: TgUpdate,
  deps: { tg: TelegramClient; notify: NotifyStore; env: RouterEnv; now?: () => Date },
): Promise<void> {
  const { tg, notify, env } = deps;
  const now = deps.now ?? (() => new Date());

  // --- Designer pressed Accept
  const cb = update.callback_query;
  if (cb) {
    const chatId = cb.message?.chat.id;
    // Accept buttons exist only in the designers' group; ignore anything else.
    if (!cb.data?.startsWith("accept:") || String(chatId) !== env.designersChatId || !cb.message) {
      await tg.answerCallbackQuery(cb.id);
      return;
    }
    const by = displayName(cb.from);
    const result = await notify.acceptHandoff(cb.data.slice("accept:".length), by, cb.from.id);
    if (result.accepted) {
      await tg.editMessageText(chatId!, cb.message.message_id, `${cb.message.text ?? ""}\n\n✅ Accepted by ${by} · ${formatIst(now())}`);
      await tg.answerCallbackQuery(cb.id);
    } else {
      await tg.answerCallbackQuery(cb.id, `Already accepted by ${result.by ?? "someone else"}.`);
    }
    return;
  }

  // --- A caller talking to the bot (private chats only)
  const m = update.message;
  if (!m || m.chat.type !== "private" || !m.from) return;
  const chatId = m.chat.id;

  const sendLink = async (c: { enquiryId: string; callerId?: string; name: string | null; phone: string }, linkId: string | null) => {
    await tg.sendMessage(chatId, callerLink(c.name, bookingLink(c.name, c.phone, env.calcomUrl)), { removeKeyboard: true });
    if (linkId) {
      await notify.markLinkStarted(linkId, chatId);
      await notify.markLinkSent(linkId, c.enquiryId);
    }
  };

  // Shared contact: must be the sender's own number (not a forwarded contact), or anyone could claim any number.
  if (m.contact) {
    if (m.contact.user_id !== m.from.id) {
      await tg.sendMessage(chatId, "Please use the button to share your own number.", { requestContactButton: "Share my phone number" });
      return;
    }
    const phone = normalisePhone(m.contact.phone_number);
    const found = await notify.findLatestQualifiedByPhone(phone, new Date(now().getTime() - CLAIM_WINDOW_DAYS * 86_400_000));
    if (!found) {
      await tg.sendMessage(chatId, callerNoMatch, { removeKeyboard: true });
      await tg.sendMessage(env.frontDeskChatId, unmatchedContactAlert(phone, displayName(m.from)));
      return;
    }
    await sendLink(found, found.linkId);
    return;
  }

  // /start with a personal token (links the front desk can forward), otherwise ask for their number
  if (m.text?.startsWith("/start")) {
    const token = m.text.split(/\s+/)[1];
    if (token) {
      const link = await notify.findLinkByToken(token);
      if (link) {
        await sendLink({ enquiryId: link.enquiryId, name: link.name, phone: link.phone }, link.id);
        return;
      }
    }
    await tg.sendMessage(chatId, callerWelcome, { requestContactButton: "Share my phone number" });
    return;
  }

  await tg.sendMessage(chatId, callerOther);
}
