const inrFmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const numFmt = new Intl.NumberFormat("en-IN");

export const inr = (n: number | null | undefined) => (n == null ? "—" : inrFmt.format(n));
export const num = (n: number | null | undefined) => (n == null ? "—" : numFmt.format(n));
export const pct = (part: number, whole: number) => (whole ? `${Math.round((100 * part) / whole)}%` : "—");

export function istDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
  }).format(new Date(d));
}

export function minutes(m: number | null | undefined): string {
  if (m == null) return "—";
  if (m < 1) return "under a minute";
  if (m < 90) return `${Math.round(m)} min`;
  if (m < 48 * 60) return `${(m / 60).toFixed(1)} hours`;
  return `${(m / 1440).toFixed(1)} days`;
}

export function duration(sec: number | null | undefined): string {
  if (sec == null) return "—";
  return `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, "0")}s`;
}

// Lists show a partly hidden number; the call page (admins only) shows it in full.
export function maskedPhone(p: string | null | undefined): string {
  if (!p) return "—";
  return p.length <= 6 ? "***" : `${p.slice(0, 3)}******${p.slice(-2)}`;
}

export const CATEGORY_LABEL: Record<string, string> = {
  qualified: "Qualified",
  not_qualified: "Not qualified",
  unsure: "Needs a person",
};

export const REASON_LABEL: Record<string, string> = {
  complaint: "Complaint",
  asked_for_person: "Asked for a person",
  unsure: "Details unclear",
  missed_call: "Missed call",
  dropped_call: "Dropped call",
  budget_mismatch: "Budget mismatch",
  decision_maker: "Decision-maker unclear",
  small_commercial: "Very small commercial space",
  pipeline_failure: "System problem",
};

export function hubspotUrl(kind: "deal" | "contact", id: string | null | undefined): string | null {
  const base = process.env.HUBSPOT_APP_URL;
  const portal = process.env.HUBSPOT_PORTAL_ID;
  if (!id || !base || !portal) return null;
  return `${base.replace(/\/$/, "")}/contacts/${portal}/record/${kind === "deal" ? "0-3" : "0-1"}/${id}`;
}
