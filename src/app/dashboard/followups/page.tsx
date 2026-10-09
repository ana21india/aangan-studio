import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admins";
import { followups } from "@/lib/dashboard/queries";
import { istDateTime, maskedPhone, REASON_LABEL } from "@/lib/dashboard/format";

export default async function FollowupsPage() {
  await requireAdmin();
  const f = await followups();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink">Follow-ups</h1>
        <p className="mt-1 text-sm text-ink2">Things a person still needs to act on. Nothing here should sit for long.</p>
      </div>

      <section>
        <h2 className="mb-2 font-medium text-ink">Open front-desk alerts ({f.openEscalations.length})</h2>
        <div className="card table-wrap !p-0">
          <table className="data-table">
            <thead><tr><th>Reason</th><th>Who</th><th>Since (IST)</th><th></th></tr></thead>
            <tbody>
              {f.openEscalations.length === 0 && <tr><td colSpan={4} className="text-ink2">Nothing open.</td></tr>}
              {f.openEscalations.map((e) => (
                <tr key={e.id}>
                  <td>{e.urgent ? "🚨 " : ""}{REASON_LABEL[e.reason] ?? e.reason}</td>
                  <td>{e.name ?? "Unknown"} <span className="text-ink2 num">{maskedPhone(e.phone)}</span></td>
                  <td className="num whitespace-nowrap">{istDateTime(e.createdAt)}</td>
                  <td>{e.callId && <Link className="text-accent underline" href={`/dashboard/calls/${e.callId}`}>Open</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-medium text-ink">Handoffs no designer has accepted ({f.unaccepted.length})</h2>
        <div className="card table-wrap !p-0">
          <table className="data-table">
            <thead><tr><th>Caller</th><th>Sent to designers (IST)</th></tr></thead>
            <tbody>
              {f.unaccepted.length === 0 && <tr><td colSpan={2} className="text-ink2">Every handoff has been accepted.</td></tr>}
              {f.unaccepted.map((h) => (
                <tr key={h.handoffId}><td>{h.name ?? "Unknown"} <span className="text-ink2 num">{maskedPhone(h.phone)}</span></td><td className="num">{istDateTime(h.sentAt)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-medium text-ink">Booking link sent but not booked ({f.linkNotBooked.length})</h2>
        <div className="card table-wrap !p-0">
          <table className="data-table">
            <thead><tr><th>Caller</th><th>Qualified at (IST)</th><th>Where it stands</th></tr></thead>
            <tbody>
              {f.linkNotBooked.length === 0 && <tr><td colSpan={3} className="text-ink2">Everyone with a link has booked.</td></tr>}
              {f.linkNotBooked.map((l) => (
                <tr key={l.enquiryId}>
                  <td>{l.name ?? "Unknown"} <span className="text-ink2 num">{maskedPhone(l.phone)}</span></td>
                  <td className="num whitespace-nowrap">{istDateTime(l.createdAt)}</td>
                  <td>{l.linkSent ? "Got the link, has not booked" : l.started ? "Started the bot, link not sent" : <span className="text-warning">Has not started the bot</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
