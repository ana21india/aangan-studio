// Horizontal bar charts rendered on the server (no JavaScript needed). Native hover text comes from <title>.

export interface BarDatum { label: string; value: number; detail?: string }

// One series, sorted high to low, value at the tip, thin bars with a 4px rounded end.
export function HBars({ title, data, unit = "" }: { title: string; data: BarDatum[]; unit?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const ROW = 34;
  const LABEL_W = 170;
  const W = 520;
  const H = Math.max(ROW, data.length * ROW) + 4;
  return (
    <figure>
      <figcaption className="mb-2 font-medium text-ink">{title}</figcaption>
      {data.length === 0 ? (
        <p className="text-sm text-ink2">Nothing in this period.</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={title}>
            {data.map((d, i) => {
              const w = Math.max(2, ((W - LABEL_W - 56) * d.value) / max);
              const y = i * ROW + 4;
              return (
                <g key={d.label}>
                  <title>{`${d.label}: ${d.value}${unit}${d.detail ? ` (${d.detail})` : ""}`}</title>
                  <text x={0} y={y + 16} fontSize={13} fill="var(--ink2)">{d.label}</text>
                  <rect x={LABEL_W} y={y + 4} width={w} height={16} rx={4} fill="var(--series-1)" />
                  <text x={LABEL_W + w + 8} y={y + 17} fontSize={13} fill="var(--ink)" className="num">{d.value}{unit}</text>
                </g>
              );
            })}
          </svg>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-ink2">View as table</summary>
            <table className="data-table num mt-2"><tbody>{data.map((d) => <tr key={d.label}><td>{d.label}</td><td>{d.value}{unit}</td><td className="text-ink2">{d.detail ?? ""}</td></tr>)}</tbody></table>
          </details>
        </>
      )}
    </figure>
  );
}

export interface Part { label: string; value: number; color: string }

// Part-to-whole: one stacked bar with 2px gaps, a legend, and counts in the legend.
export function ShareBar({ title, parts }: { title: string; parts: Part[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const W = 520;
  const shown = parts.filter((p) => p.value > 0);
  const starts = shown.map((_, i) => shown.slice(0, i).reduce((sum, p) => sum + (p.value / total) * W, 0));
  return (
    <figure>
      <figcaption className="mb-2 font-medium text-ink">{title}</figcaption>
      {total === 0 ? (
        <p className="text-sm text-ink2">No enquiries in this period.</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} 28`} className="w-full h-auto" role="img" aria-label={title}>
            {shown.map((p, i) => {
              const w = (p.value / total) * W;
              return (
                <g key={p.label}>
                  <title>{`${p.label}: ${p.value} (${Math.round((100 * p.value) / total)}%)`}</title>
                  <rect x={starts[i]} y={2} width={Math.max(w - (i < shown.length - 1 ? 2 : 0), 1)} height={24} rx={i === 0 || i === shown.length - 1 ? 4 : 0} fill={p.color} />
                </g>
              );
            })}
          </svg>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink2">
            {parts.map((p) => (
              <li key={p.label} className="inline-flex items-center gap-1.5">
                <span aria-hidden className="inline-block size-2.5 rounded-sm" style={{ background: p.color }} />
                {p.label}: <span className="num text-ink">{p.value}</span> <span className="num">({Math.round((100 * p.value) / total)}%)</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </figure>
  );
}
