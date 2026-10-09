// Date ranges for every dashboard view. Days are India days (IST), whatever time zone the server runs in.
export interface Range {
  from: Date; // inclusive
  to: Date; // exclusive
  key: string; // 'today' | '7d' | '30d' | '90d' | 'mtd' | 'custom'
  label: string;
  fromDay: string; // YYYY-MM-DD (IST)
  toDay: string; // YYYY-MM-DD (IST), inclusive
  days: number;
}

const IST_MS = 5.5 * 3600_000;
const DAY_MS = 86_400_000;

export const PRESETS: { key: string; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "mtd", label: "This month" },
];

export const istDay = (d: Date): string => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
export const startOfIstDay = (day: string): Date => new Date(`${day}T00:00:00+05:30`);
const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export function parseRange(params: { range?: string; from?: string; to?: string }, now = new Date()): Range {
  const today = istDay(now);
  const todayStart = startOfIstDay(today);
  const tomorrow = new Date(todayStart.getTime() + DAY_MS);

  let key = params.range ?? "30d";
  let fromDate: Date;
  let toDate = tomorrow;

  if (isDay(params.from) && isDay(params.to) && params.from <= params.to) {
    key = "custom";
    fromDate = startOfIstDay(params.from);
    toDate = new Date(startOfIstDay(params.to).getTime() + DAY_MS);
  } else if (key === "today") {
    fromDate = todayStart;
  } else if (key === "7d") {
    fromDate = new Date(todayStart.getTime() - 6 * DAY_MS);
  } else if (key === "90d") {
    fromDate = new Date(todayStart.getTime() - 89 * DAY_MS);
  } else if (key === "mtd") {
    fromDate = startOfIstDay(`${today.slice(0, 8)}01`);
  } else {
    key = "30d";
    fromDate = new Date(todayStart.getTime() - 29 * DAY_MS);
  }

  const days = Math.round((toDate.getTime() - fromDate.getTime()) / DAY_MS);
  const fromDay = istDay(fromDate);
  const toDay = istDay(new Date(toDate.getTime() - 1));
  const label = key === "custom" ? `${fromDay} to ${toDay}` : (PRESETS.find((p) => p.key === key)?.label ?? "Last 30 days");
  return { from: fromDate, to: toDate, key, label, fromDay, toDay, days };
}

// Calendar months (IST) a range touches, used to add fixed monthly plan costs.
export function monthsTouched(r: Range): string[] {
  const out: string[] = [];
  let y = Number(r.fromDay.slice(0, 4));
  let m = Number(r.fromDay.slice(5, 7));
  const endY = Number(r.toDay.slice(0, 4));
  const endM = Number(r.toDay.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

export function daysIn(r: Range): string[] {
  return Array.from({ length: r.days }, (_, i) => istDay(new Date(r.from.getTime() + i * DAY_MS)));
}
