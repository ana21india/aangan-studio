export interface EnquiryContext {
  enquiryId: string;
  callerId: string;
  phone: string;
  name: string | null;
}

export interface LinkRow {
  id: string;
  enquiryId: string;
  callerId: string;
  token: string;
  chatId: number | null;
  linkSentAt: Date | null;
  name: string | null;
  phone: string;
}

export interface DueLink extends LinkRow {
  createdAt: Date;
}

export interface OverdueHandoff {
  id: string;
  enquiryId: string;
  name: string | null;
  phone: string;
  sentAt: Date;
  messageId: number | null;
}

export interface StaleEscalation {
  id: string;
  reason: string;
  enquiryId: string | null;
  name: string | null;
  phone: string | null;
  createdAt: Date;
}

export type AcceptResult = { accepted: true } | { accepted: false; by: string | null };

// Everything the Telegram side needs from storage. Tests use an in-memory version.
export interface NotifyStore {
  getEnquiryContext(enquiryId: string): Promise<EnquiryContext | null>;

  createHandoff(enquiryId: string): Promise<string>;
  setHandoffMessage(handoffId: string, messageId: number): Promise<void>;
  acceptHandoff(handoffId: string, by: string, telegramUserId: number): Promise<AcceptResult>;

  createTelegramLink(a: { enquiryId: string; callerId: string; token: string; nudgeDueAt: Date | null; morningDueAt: Date }): Promise<void>;
  findLinkByToken(token: string): Promise<LinkRow | null>;
  findLatestQualifiedByPhone(phone: string, since: Date): Promise<(EnquiryContext & { linkId: string | null }) | null>;
  markLinkStarted(linkId: string, chatId: number): Promise<void>;
  markLinkSent(linkId: string, enquiryId: string): Promise<void>;

  dueNudges(now: Date): Promise<DueLink[]>;
  markNudged(linkId: string): Promise<void>;
  dueMorning(now: Date): Promise<DueLink[]>;
  markMorningSent(linkId: string): Promise<void>;
  overdueHandoffs(cutoff: Date): Promise<OverdueHandoff[]>;
  markOverdueAlerted(handoffId: string): Promise<void>;
  staleEscalations(cutoff: Date): Promise<StaleEscalation[]>;
  markEscalationRealerted(id: string): Promise<void>;
}
