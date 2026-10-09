import Link from "next/link";
import { PRESETS, type Range } from "@/lib/dashboard/range";

// Presets are plain links, so the page works without JavaScript. Custom dates use a small GET form.
export function RangePicker({ range, basePath, keep = {} }: { range: Range; basePath: string; keep?: Record<string, string | undefined> }) {
  const extra = Object.entries(keep).filter(([, v]) => v);
  const href = (key: string) => {
    const p = new URLSearchParams(extra as [string, string][]);
    p.set("range", key);
    return `${basePath}?${p.toString()}`;
  };
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3" aria-label="Date range">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Link key={p.key} href={href(p.key)} className="chip" aria-current={range.key === p.key}>
            {p.label}
          </Link>
        ))}
      </div>
      <form action={basePath} method="get" className="flex flex-wrap items-end gap-2 text-sm">
        {extra.map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <label className="block">
          <span className="text-ink2">From</span>
          <input type="date" name="from" defaultValue={range.fromDay} className="field mt-1 !w-auto" />
        </label>
        <label className="block">
          <span className="text-ink2">To</span>
          <input type="date" name="to" defaultValue={range.toDay} className="field mt-1 !w-auto" />
        </label>
        <button type="submit" className="chip" aria-current={range.key === "custom"}>Apply</button>
      </form>
    </div>
  );
}
