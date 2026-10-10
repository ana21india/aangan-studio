import type {
  AttachedBooking, UnmatchedBooking, BookingRecord, CallerCrm, AcceptResult, DueLink, EnquiryContext, LinkRow, NotifyStore, OverdueHandoff, StaleEscalation,
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

  callerCrm = new Map<string, { name: string | null; phone: string; hubspotContactId: string | null }>();
  deals = new Map<string, string>();
  bookingRows: BookingRecord[] = [];

  async getCallerCrm(callerId: string): Promise<CallerCrm | null> {
    const c = this.callerCrm.get(callerId);
    return c ? { callerId, ...c } : null;
  }
  async setCallerContact(callerId: string, id: string) { this.callerCrm.get(callerId)!.hubspotContactId = id; }
  async getEnquiryDeal(enquiryId: string) { return this.deals.get(enquiryId) ?? null; }
  async setEnquiryDeal(enquiryId: string, dealId: string) { this.deals.set(enquiryId, dealId); }
  async findLatestQualifiedByPhoneForBooking(phone: string, since: Date) {
    const e = [...this.enquiries.values()].filter((x) => x.phone === phone && x.qualified && x.createdAt >= since).pop();
    return e ? { ...e, dealId: this.deals.get(e.enquiryId) ?? null } : null;
  }
  async upsertBooking(b: BookingRecord) {
    const i = this.bookingRows.findIndex((x) => x.calBookingId === b.calBookingId);
    if (i >= 0) this.bookingRows[i] = { ...b, enquiryId: this.bookingRows[i].enquiryId ?? b.enquiryId };
    else this.bookingRows.push(b);
  }

  alertedBookings = new Set<string>();
  async attachPendingBooking(enquiryId: string, phone: string): Promise<AttachedBooking | null> {
    const b = [...this.bookingRows].reverse().find((x) => !x.enquiryId && x.status === "booked" && x.attendeePhone === phone);
    if (!b) return null;
    b.enquiryId = enquiryId;
    return { calBookingId: b.calBookingId, scheduledFor: b.scheduledFor };
  }
  async unmatchedBookingsDue(): Promise<UnmatchedBooking[]> {
    return this.bookingRows.filter((b) => !b.enquiryId && b.status === "booked" && !this.alertedBookings.has(b.calBookingId))
      .map((b) => ({ id: b.calBookingId, calBookingId: b.calBookingId, name: b.attendeeName, phone: b.attendeePhone, scheduledFor: b.scheduledFor }));
  }
  async markBookingAlerted(id: string) { this.alertedBookings.add(id); }
}
