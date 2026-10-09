import type {
  AcceptResult, DueLink, EnquiryContext, LinkRow, NotifyStore, OverdueHandoff, StaleEscalation,
} from "./store";

// In-memory stand-in for tests.
export class MemoryNotifyStore implements NotifyStore {
  enquiries = new Map<string, EnquiryContext & { qualified: boolean; createdAt: Date }>();
  handoffs: { id: string; enquiryId: string; messageId?: number; by?: string; acceptedAt?: Date; sentAt: Date; overdueAlerted?: boolean }[] = [];
  links: (DueLink & { nudgeDueAt: Date | null; morningDueAt: Date; started?: boolean; nudged?: boolean; morningSent?: boolean })[] = [];
  bookings = new Set<string>();
  stale: StaleEscalation[] = [];

  async getEnquiryContext(id: string) { return this.enquiries.get(id) ?? null; }

  async createHandoff(enquiryId: string) {
    const id = `h${this.handoffs.length + 1}`;
    this.handoffs.push({ id, enquiryId, sentAt: new Date() });
    return id;
  }
  async setHandoffMessage(id: string, messageId: number) { this.handoffs.find((h) => h.id === id)!.messageId = messageId; }
  async acceptHandoff(id: string, by: string): Promise<AcceptResult> {
    const h = this.handoffs.find((x) => x.id === id)!;
    if (h.acceptedAt) return { accepted: false, by: h.by ?? null };
    h.by = by; h.acceptedAt = new Date();
    return { accepted: true };
  }

  async createTelegramLink(a: { enquiryId: string; callerId: string; token: string; nudgeDueAt: Date | null; morningDueAt: Date }) {
    const e = this.enquiries.get(a.enquiryId)!;
    this.links.push({ id: `l${this.links.length + 1}`, enquiryId: a.enquiryId, callerId: a.callerId, token: a.token, chatId: null, linkSentAt: null, name: e.name, phone: e.phone, createdAt: new Date(), nudgeDueAt: a.nudgeDueAt, morningDueAt: a.morningDueAt });
  }
  async findLinkByToken(token: string): Promise<LinkRow | null> { return this.links.find((l) => l.token === token) ?? null; }
  async findLatestQualifiedByPhone(phone: string, since: Date) {
    const e = [...this.enquiries.values()].filter((x) => x.phone === phone && x.qualified && x.createdAt >= since).pop();
    if (!e) return null;
    return { ...e, linkId: this.links.find((l) => l.enquiryId === e.enquiryId)?.id ?? null };
  }
  async markLinkStarted(id: string, chatId: number) { const l = this.links.find((x) => x.id === id)!; l.chatId = chatId; l.started = true; }
  async markLinkSent(id: string) { this.links.find((x) => x.id === id)!.linkSentAt = new Date(); }

  async dueNudges(now: Date) {
    return this.links.filter((l) => !l.started && !l.linkSentAt && !l.nudged && l.nudgeDueAt !== null && l.nudgeDueAt <= now && !this.bookings.has(l.enquiryId));
  }
  async markNudged(id: string) { this.links.find((x) => x.id === id)!.nudged = true; }
  async dueMorning(now: Date) {
    return this.links.filter((l) => !l.morningSent && l.morningDueAt <= now && !this.bookings.has(l.enquiryId));
  }
  async markMorningSent(id: string) { this.links.find((x) => x.id === id)!.morningSent = true; }

  async overdueHandoffs(cutoff: Date): Promise<OverdueHandoff[]> {
    return this.handoffs.filter((h) => !h.acceptedAt && !h.overdueAlerted && h.sentAt <= cutoff).map((h) => {
      const e = this.enquiries.get(h.enquiryId)!;
      return { id: h.id, enquiryId: h.enquiryId, name: e.name, phone: e.phone, sentAt: h.sentAt, messageId: h.messageId ?? null };
    });
  }
  async markOverdueAlerted(id: string) { this.handoffs.find((h) => h.id === id)!.overdueAlerted = true; }
  async staleEscalations(cutoff: Date) { return this.stale.filter((s) => s.createdAt <= cutoff); }
  async markEscalationRealerted(id: string) { this.stale = this.stale.filter((s) => s.id !== id); }
}
