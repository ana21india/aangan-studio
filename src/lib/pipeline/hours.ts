// Office hours are 10am-7pm India time (config OFFICE_HOURS_START / OFFICE_HOURS_END).
export function isInHours(at: Date, startHour: number, endHour: number): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(at),
  );
  return hour >= startHour && hour < endHour;
}

// The next moment the office opens (10:00 IST by default) at or after `from`. Returns `from` if already open.
export function nextOfficeOpen(from: Date, startHour = 10, endHour = 19): Date {
  if (isInHours(from, startHour, endHour)) return from;
  const ist = new Date(from.getTime() + 5.5 * 3600_000);
  const open = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), startHour, 0, 0));
  let result = new Date(open.getTime() - 5.5 * 3600_000);
  if (result <= from) result = new Date(result.getTime() + 24 * 3600_000);
  return result;
}

export function formatIst(at: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
  }).format(at);
}

export function maskPhone(phone: string | null): string {
  if (!phone) return "unknown";
  return phone.length <= 6 ? "***" : `${phone.slice(0, 3)}******${phone.slice(-2)}`;
}
