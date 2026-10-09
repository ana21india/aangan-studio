// Thin Telegram Bot API client. The interface lets tests swap in a fake.
export interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface SendOptions {
  inlineKeyboard?: InlineButton[][];
  requestContactButton?: string; // shows a one-tap "share my number" keyboard
  removeKeyboard?: boolean;
}

export interface TelegramClient {
  sendMessage(chatId: number | string, text: string, opts?: SendOptions): Promise<{ message_id: number }>;
  editMessageText(chatId: number | string, messageId: number, text: string): Promise<void>;
  answerCallbackQuery(id: string, text?: string): Promise<void>;
}

export class HttpTelegram implements TelegramClient {
  constructor(private readonly token = process.env.TELEGRAM_BOT_TOKEN) {}

  private async call<T>(method: string, body: Record<string, unknown>): Promise<T> {
    if (!this.token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
    const res = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { ok: boolean; result: T; description?: string };
    if (!json.ok) throw new Error(`Telegram ${method} failed: ${json.description ?? res.status}`);
    return json.result;
  }

  sendMessage(chatId: number | string, text: string, opts: SendOptions = {}) {
    let reply_markup: unknown;
    if (opts.inlineKeyboard) reply_markup = { inline_keyboard: opts.inlineKeyboard };
    else if (opts.requestContactButton) {
      reply_markup = {
        keyboard: [[{ text: opts.requestContactButton, request_contact: true }]],
        one_time_keyboard: true,
        resize_keyboard: true,
      };
    } else if (opts.removeKeyboard) reply_markup = { remove_keyboard: true };
    return this.call<{ message_id: number }>("sendMessage", {
      chat_id: chatId,
      text,
      link_preview_options: { is_disabled: true },
      ...(reply_markup ? { reply_markup } : {}),
    });
  }

  async editMessageText(chatId: number | string, messageId: number, text: string) {
    // Passing an empty inline keyboard removes the Accept button.
    await this.call("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: [] },
    });
  }

  async answerCallbackQuery(id: string, text?: string) {
    await this.call("answerCallbackQuery", { callback_query_id: id, ...(text ? { text, show_alert: true } : {}) });
  }
}

// Setup helpers used by scripts/telegram-setup.ts
export async function telegramRaw<T>(token: string, method: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description}`);
  return json.result;
}
