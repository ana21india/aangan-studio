import Link from "next/link";
import { RangePicker } from "@/components/range-picker";
import { StatTile } from "@/components/stat-tile";
import { requireAdmin } from "@/lib/auth/admins";
import { costsPerCall, LINE_LABEL, overview } from "@/lib/dashboard/queries";
import { parseRange } from "@/lib/dashboard/range";
import { inr, istDateTime, num } from "@/lib/dashboard/format";

export default async function CostsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const range = parseRange(await searchParams);
  const [o, perCall] = await Promise.all([overview(range), costsPerCall(range)]);
  const c = o.costs;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Costs</h1>
        <p className="mt-1 mb-4 text-sm text-ink2">{range.label} · {range.fromDay} to {range.toDay}</p>
        <RangePicker range={range} basePath="/dashboard/costs" />
      </div>

      {c.total === 0 && o.calls.total > 0 && (
        <p className="card text-sm text-warning" role="note">
          Costs show ₹0 because unit prices are not set. Set COST_VAANI_PER_MIN_INR, COST_GEMINI_PER_1M_INPUT_TOKENS_INR, COST_GEMINI_PER_1M_OUTPUT_TOKENS_INR and COST_FIXED_MONTHLY_INR in the app settings.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total this period" value={inr(c.total)} note={`${inr(c.variable)} per-use + ${inr(c.fixed)} fixed`} />
        <StatTile label="Per qualified lead" value={inr(c.perQualifiedLead)} note={`${o.outcomes.qualified} qualified`} />
        <StatTile label="Per booking" value={inr(c.perBooking)} note={`${o.bookings.booked} booked`} />
        <StatTile label="Per call" value={inr(c.perCall)} note={`${num(o.calls.total)} calls`} />
      </div>

      <div className="card table-wrap">
        <h2 className="mb-2 font-medium text-ink">By cost line</h2>
        <table className="data-table num">
          <thead><tr><th>Line</th><th>Quantity</th><th>Amount</th></tr></thead>
          <tbody>
            {c.byLine.map((l) => <tr key={l.line}><td>{LINE_LABEL[l.line] ?? l.line}</td><td>{num(Math.round(l.quantity * 100) / 100)}{l.line === "vaani_minutes" ? " min" : l.line === "gemini_tokens" ? " tokens" : ""}</td><td>{inr(l.amount)}</td></tr>)}
            {c.fixedBreakdown.map((f) => <tr key={f.name}><td>{f.name} plan (fixed)</td><td>{f.months} month{f.months > 1 ? "s" : ""} × {inr(f.perMonth)}</td><td>{inr(f.amount)}</td></tr>)}
            <tr><td><b>Total</b></td><td></td><td><b>{inr(c.total)}</b></td></tr>
          </tbody>
        </table>
      </div>

      <div className="card table-wrap">
        <h2 className="mb-2 font-medium text-ink">Per call (latest 200 in this period)</h2>
        <table className="data-table num">
          <thead><tr><th>When (IST)</th><th>Caller</th><th>Vaani</th><th>Gemini</th><th>SMS</th><th>Total</th></tr></thead>
          <tbody>
            {perCall.length === 0 && <tr><td colSpan={6} className="text-ink2">No calls in this period.</td></tr>}
            {perCall.map((x) => (
              <tr key={x.id}>
                <td className="whitespace-nowrap"><Link className="text-accent underline" href={`/dashboard/calls/${x.id}`}>{istDateTime(x.startedAt)}</Link></td>
                <td>{x.name ?? "Unknown"}</td><td>{inr(x.vaani)}</td><td>{inr(x.gemini)}</td><td>{inr(x.sms)}</td><td>{inr(x.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
