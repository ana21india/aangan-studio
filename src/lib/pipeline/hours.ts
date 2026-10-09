// Office hours are 10am-7pm India time (config OFFICE_HOURS_START / OFFICE_HOURS_END).
export function isInHours(at: Date, startHour: number, endHour: number): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(at),
  );
  return hour >= startHour && hour < endHour;
}

export function maskPhone(phone: string | null): string {
  if (!phone) return "unknown";
  return phone.length <= 6 ? "***" : `${phone.slice(0, 3)}******${phone.slice(-2)}`;
}
