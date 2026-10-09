// Cal.com booking link with the caller's name and phone prefilled (parameter names per Cal.com docs;
// confirm with a real booking in Milestone 4). The link is only ever sent in the caller's own private chat
// and to the internal front-desk chat. See DECISIONS.md D-029.
export function bookingLink(name: string | null, phone: string, base = process.env.CALCOM_BOOKING_URL): string {
  if (!base) throw new Error("CALCOM_BOOKING_URL is not set");
  const url = new URL(base);
  if (name) url.searchParams.set("name", name);
  url.searchParams.set("attendeePhoneNumber", phone);
  return url.toString();
}

export function startLink(botUsername: string, token: string): string {
  return `https://t.me/${botUsername}?start=${token}`;
}
