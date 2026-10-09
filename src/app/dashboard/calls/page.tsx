import Link from "next/link";
import { RangePicker } from "@/components/range-picker";
import { requireAdmin } from "@/lib/auth/admins";
import { callList, PAGE_SIZE } from "@/lib/dashboard/queries";
import { parseRange } from "@/lib/dashboard/range";
import { CATEGORY_LABEL, duration, istDateTime, maskedPhone } from "@/lib/dashboard/format";

type Params = Record<string, string | undefined>;

const STATUSES = ["completed", "dropped", "missed", "transferred"];
const CATEGORIES = ["qualified", "unsure", "not_qualified", "pending"];

export default async function CallsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const sp = await searchParams;
  const range = parseRange(sp);
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, total } = await callList(range, { status: sp.status, category: sp.category, q: sp.q?.trim() || undefined, page });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const rangeParams: Params = range.key === "custom" ? { from: range.fromDay, to: range.toDay } : { range: range.key };
  const link = (over: Params) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...rangeParams, status: sp.status, category: sp.category, q: sp.q, ...over })) if (v) p.set(k, v);
    return `/dashboard/calls?${p.toString()}`;
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Calls</h1>
        <p className="mt-1 mb-4 text-sm text-ink2">{total} calls · {range.label}</p>
        <RangePicker range={range} basePath="/dashboard/calls" keep={{ status: sp.status, category: sp.category, q: sp.q }} />
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ink2">Call:</span>
          <Link href={link({ status: undefined, page: undefined })} className="chip" aria-current={!sp.status}>All</Link>
          {STATUSES.map((s) => <Link key={s} href={link({ status: s, page: undefined })} className="chip" aria-current={sp.status === s}>{s}</Link>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ink2">Result:</span>
          <Link href={link({ category: undefined, page: undefined })} className="chip" aria-current={!sp.category}>All</Link>
          {CATEGORIES.map((c) => <Link key={c} href={link({ category: c, page: undefined })} className="chip" aria-current={sp.category === c}>{c === "pending" ? "Awaiting" : CATEGORY_LABEL[c]}</Link>)}
        </div>
        <form action="/dashboard/calls" method="get" className="flex items-center gap-2">
          {Object.entries({ ...rangeParams, status: sp.status, category: sp.category }).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
          <input name="q" defaultValue={sp.q} placeholder="Search name or number" className="field !w-56" aria-label="Search" />
          <button className="chip" type="submit">Search</button>
        </form>
      </div>

      <div className="card table-wrap !p-0">
        <table className="data-table">
          <thead><tr><th>When (IST)</th><th>Caller</th><th>Call</th><th>Length</th><th>Result</th><th>Score</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="text-ink2">No calls match these filters.</td></tr>}
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="num whitespace-nowrap"><Link className="text-accent underline" href={`/dashboard/calls/${c.id}`}>{istDateTime(c.startedAt)}</Link></td>
                <td>{c.name ?? "Unknown"}<div className="text-ink2 num">{maskedPhone(c.phone)}</div></td>
                <td>{c.status}{c.inHours === false && <span className="text-ink2"> · after hours</span>}{c.state === "failed" && <span className="text-critical"> · failed</span>}</td>
                <td className="num">{duration(c.durationSec)}</td>
                <td>{c.category ? CATEGORY_LABEL[c.category] : <span className="text-ink2">Awaiting</span>}</td>
                <td className="num">{c.score ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center gap-3 text-sm">
          {page > 1 && <Link className="chip" href={link({ page: String(page - 1) })}>Newer</Link>}
          <span className="text-ink2">Page {page} of {pages}</span>
          {page < pages && <Link className="chip" href={link({ page: String(page + 1) })}>Older</Link>}
        </nav>
      )}
    </div>
  );
}
