import { StackedColumns } from "@/components/stacked-columns";
import { HBars, ShareBar } from "@/components/bars";
import { RangePicker } from "@/components/range-picker";
import { HeroFigure, StatTile } from "@/components/stat-tile";
import { requireAdmin } from "@/lib/auth/admins";
import { overview } from "@/lib/dashboard/queries";
import { parseRange } from "@/lib/dashboard/range";
import { inr, minutes, num, pct, REASON_LABEL } from "@/lib/dashboard/format";

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const range = parseRange(await searchParams);
  const o = await overview(range);

  const enquiries = o.outcomes.qualified + o.outcomes.notQualified + o.outcomes.unsure + o.outcomes.pending;
  const answered = o.calls.total - o.calls.missed;
  const afterShare = pct(o.calls.afterHours, o.calls.total);
  const noPrices = o.costs.total === 0 && o.calls.total > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Overview</h1>
        <p className="mt-1 mb-4 text-sm text-ink2">{range.label} · {range.fromDay} to {range.toDay}</p>
        <RangePicker range={range} basePath="/dashboard" />
      </div>

      <HeroFigure
        label="Calls answered live by the agent"
        value={pct(answered, o.calls.total)}
        note={`${o.calls.total ? `${num(answered)} of ${num(o.calls.total)} calls were picked up, day or night. ` : "No calls in this period yet. "}Before the agent, about 48% of enquiries got no reply within 48 hours, and a third arrived outside 10am to 7pm.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Calls" value={num(o.calls.total)} note={o.calls.total ? `${afterShare} after hours · ${o.calls.missed} missed · ${o.calls.dropped} dropped` : "No calls yet"} />
        <StatTile label="Qualified rate" value={pct(o.outcomes.qualified, enquiries)} note={`${o.outcomes.qualified} of ${enquiries} enquiries`} />
        <StatTile label="Handoffs accepted" value={`${o.handoffs.accepted} of ${o.handoffs.sent}`} note={`Typical time to accept: ${minutes(o.handoffs.medianAcceptMinutes)}`} />
        <StatTile label="Consultations booked" value={num(o.bookings.booked)} note={o.bookings.cancelled ? `${o.bookings.cancelled} cancelled` : undefined} />
      </div>

      <div className="card"><StackedColumns data={o.perDay} /></div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <ShareBar
            title="What happened to each enquiry"
            parts={[
              { label: "Qualified", value: o.outcomes.qualified, color: "var(--series-1)" },
              { label: "Needs a person", value: o.outcomes.unsure, color: "var(--series-2)" },
              { label: "Not qualified", value: o.outcomes.notQualified, color: "var(--series-3)" },
              ...(o.outcomes.pending ? [{ label: "Awaiting a result", value: o.outcomes.pending, color: "var(--axis)" }] : []),
            ]}
          />
        </div>
        <div className="card">
          <HBars
            title="Sent to the front desk, by reason"
            data={o.escalations.map((e) => ({ label: REASON_LABEL[e.reason] ?? e.reason, value: e.total, detail: e.open ? `${e.open} still open` : "all resolved" }))}
          />
        </div>
      </div>

      <div className="card">
        <h2 className="font-medium text-ink">Cost of running the agent</h2>
        {noPrices && (
          <p className="mt-2 text-sm text-warning" role="note">
            The costs show ₹0 because unit prices are not set yet. Add the Vaani and Gemini prices in the app settings to see real figures.
          </p>
        )}
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Total this period" value={inr(o.costs.total)} note={`Including ${inr(o.costs.fixed)} of fixed monthly plans`} />
          <StatTile label="Per qualified lead" value={inr(o.costs.perQualifiedLead)} />
          <StatTile label="Per booking" value={inr(o.costs.perBooking)} />
          <StatTile label="Per call" value={inr(o.costs.perCall)} />
        </div>
        <p className="mt-3 text-sm"><a className="text-accent underline" href={`/dashboard/costs?range=${range.key === "custom" ? "30d" : range.key}`}>See the full cost breakdown</a></p>
      </div>
    </div>
  );
}
