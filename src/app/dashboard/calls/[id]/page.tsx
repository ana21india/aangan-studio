import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admins";
import { callDetail } from "@/lib/dashboard/queries";
import { CATEGORY_LABEL, duration, hubspotUrl, inr, istDateTime, REASON_LABEL } from "@/lib/dashboard/format";

type Criterion = { status: "pass" | "fail" | "unclear"; reason: string };
const CRITERIA: [string, string][] = [
  ["real_project", "Real project"], ["service_area", "In our service area"], ["timeline", "Realistic timeline"],
  ["budget", "Budget"], ["decision_maker", "Decision-maker"],
];
const MARK = { pass: "✓ Pass", fail: "✗ Fail", unclear: "? Unclear" } as const;
const TONE = { pass: "text-good", fail: "text-critical", unclear: "text-warning" } as const;

const FIELDS: [string, string][] = [
  ["name", "Name"], ["space_type", "Space"], ["size_sqft", "Size (sq ft)"], ["location", "Area"], ["city", "City"], ["scope", "Scope"],
  ["timeline_text", "Timeline"], ["handover_date", "Handover"], ["budget_text", "Budget (only if volunteered)"], ["source", "Heard about us via"],
  ["decision_maker_note", "Decision-maker"], ["caller_asked_about", "Asked about"],
];

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const d = await callDetail((await params).id);
  if (!d) notFound();
  const { call, enquiry, handoff, booking, escalations, costs } = d;
  const criteria = (enquiry?.criteria ?? null) as Record<string, Criterion> | null;
  const reasons = (enquiry?.reasons ?? null) as { lines?: string[]; notes?: string[] } | null;
  const dealUrl = hubspotUrl("deal", enquiry?.hubspot_deal_id as string | undefined);
  const contactUrl = hubspotUrl("contact", d.hubspotContactId);
  const category = enquiry?.category as string | null | undefined;

  return (
    <div className="space-y-6">
      <p className="text-sm"><Link className="text-accent underline" href="/dashboard/calls">← All calls</Link></p>
      <div>
        <h1 className="text-xl font-semibold text-ink">{(enquiry?.name as string) ?? (call.caller_name as string) ?? "Unknown caller"}</h1>
        <p className="mt-1 text-sm text-ink2 num">{call.phone as string} · {istDateTime(call.started_at as string)} IST · {call.channel as string} · {call.status as string}{call.in_hours === false ? " · after hours" : ""} · {duration(call.duration_sec as number | null)}</p>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {dealUrl && <a className="text-accent underline" href={dealUrl} target="_blank" rel="noreferrer">Open the deal in HubSpot</a>}
          {contactUrl && <a className="text-accent underline" href={contactUrl} target="_blank" rel="noreferrer">Open the contact in HubSpot</a>}
        </p>
      </div>

      {call.processing_state === "failed" && (
        <p className="card text-sm text-critical" role="alert">This call hit a problem while it was processed: {String(call.processing_error ?? "unknown")}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card">
          <h2 className="font-medium text-ink">Result</h2>
          <p className="mt-2 text-2xl font-semibold">{category ? CATEGORY_LABEL[category] : "Awaiting a result"}</p>
          {enquiry?.score != null && <p className="text-sm text-ink2">Score {String(enquiry.score)} of 10 (for display; the decision follows the five criteria){enquiry.low_confidence ? " · low confidence" : ""}</p>}
          {reasons?.notes?.map((n) => <p key={n} className="mt-2 text-sm text-warning">{n}</p>)}
        </div>
        <div className="card">
          <h2 className="font-medium text-ink">Handoff</h2>
          {handoff ? (
            <ul className="mt-2 space-y-1 text-sm">
              <li>Sent to designers: {istDateTime(handoff.sent_at as string)}</li>
              <li>{handoff.accepted_at ? <>Accepted by <b>{String(handoff.accepted_by)}</b> at {istDateTime(handoff.accepted_at as string)}</> : <span className="text-warning">Not accepted yet</span>}</li>
            </ul>
          ) : <p className="mt-2 text-sm text-ink2">No handoff for this enquiry.</p>}
          {booking && <p className="mt-3 text-sm">Consultation: <b>{String(booking.status)}</b>{booking.scheduled_for ? ` for ${istDateTime(booking.scheduled_for as string)}` : ""}</p>}
        </div>
        <div className="card">
          <h2 className="font-medium text-ink">Cost of this call</h2>
          {costs.length ? (
            <table className="data-table num mt-2"><tbody>
              {costs.map((c) => <tr key={c.line}><td>{c.line.replace("_", " ")}</td><td>{inr(c.amount)}</td></tr>)}
              <tr><td><b>Total</b></td><td><b>{inr(costs.reduce((s, c) => s + c.amount, 0))}</b></td></tr>
            </tbody></table>
          ) : <p className="mt-2 text-sm text-ink2">No cost recorded.</p>}
        </div>
      </div>

      {escalations.length > 0 && (
        <div className="card">
          <h2 className="font-medium text-ink">Sent to the front desk</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {escalations.map((e) => (
              <li key={String(e.id)}>{e.urgent ? "🚨 " : ""}{REASON_LABEL[String(e.reason)] ?? String(e.reason)} · {istDateTime(e.created_at as string)} · {e.resolved_at ? "resolved" : <span className="text-warning">open</span>}</li>
            ))}
          </ul>
        </div>
      )}

      {criteria && (
        <div className="card">
          <h2 className="font-medium text-ink">The five criteria</h2>
          <table className="data-table mt-2"><tbody>
            {CRITERIA.map(([key, label]) => criteria[key] && (
              <tr key={key}><td className="whitespace-nowrap">{label}</td><td className={`whitespace-nowrap ${TONE[criteria[key].status]}`}>{MARK[criteria[key].status]}</td><td className="text-ink2">{criteria[key].reason}</td></tr>
            ))}
          </tbody></table>
        </div>
      )}

      {enquiry && (
        <div className="card">
          <h2 className="font-medium text-ink">What the caller said</h2>
          <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {FIELDS.map(([key, label]) => (
              <div key={key}><dt className="text-ink2">{label}</dt><dd>{enquiry[key] != null && enquiry[key] !== "" ? String(enquiry[key]) : <span className="text-muted">not said</span>}</dd></div>
            ))}
          </dl>
        </div>
      )}

      {enquiry?.handoff_note ? (
        <div className="card">
          <h2 className="font-medium text-ink">Designer handoff note</h2>
          <pre className="mt-2 whitespace-pre-wrap text-sm font-sans">{String(enquiry.handoff_note)}</pre>
        </div>
      ) : null}

      <div className="card">
        <h2 className="font-medium text-ink">Transcript</h2>
        {call.transcript ? <pre className="mt-2 whitespace-pre-wrap text-sm font-sans leading-relaxed">{String(call.transcript)}</pre> : <p className="mt-2 text-sm text-ink2">No transcript (the call never connected or nothing was said).</p>}
      </div>
    </div>
  );
}
