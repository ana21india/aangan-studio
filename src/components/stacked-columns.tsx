"use client";

import { useState } from "react";

export interface DayPoint { day: string; inHours: number; afterHours: number }

const W = 720;
const H = 220;
const PAD = { l: 36, r: 8, t: 8, b: 24 };

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const mag = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / mag) * mag;
}

// Calls per day, split in-hours (blue) and after-hours (orange). Thin columns, 2px gap between segments,
// 4px rounded top, hover tooltip, legend, and a table view for readers who prefer numbers.
export function StackedColumns({ data }: { data: DayPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(1, ...data.map((d) => d.inHours + d.afterHours)));
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const slot = plotW / Math.max(1, data.length);
  const bar = Math.min(24, slot * 0.7);
  const y = (v: number) => PAD.t + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const label = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
  const h = hover != null ? data[hover] : null;

  return (
    <figure>
      <figcaption className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-ink">Calls per day</span>
        <span className="flex gap-4 text-sm text-ink2">
          <span className="inline-flex items-center gap-1.5"><span aria-hidden className="inline-block size-2.5 rounded-sm bg-s1" />In office hours</span>
          <span className="inline-flex items-center gap-1.5"><span aria-hidden className="inline-block size-2.5 rounded-sm bg-s2" />After hours</span>
        </span>
      </figcaption>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Calls per day, in office hours and after hours">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
              <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{Math.round(t)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = PAD.l + i * slot + (slot - bar) / 2;
            const hIn = (d.inHours / max) * plotH;
            const hAfter = (d.afterHours / max) * plotH;
            const gap = d.inHours && d.afterHours ? 2 : 0;
            return (
              <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
                {/* wide invisible target: easier to hover than the bar itself */}
                <rect x={PAD.l + i * slot} y={PAD.t} width={slot} height={plotH} fill="transparent" />
                {d.inHours > 0 && <rect x={x} y={y(d.inHours)} width={bar} height={Math.max(hIn - gap / 2, 1)} rx={d.afterHours ? 0 : Math.min(4, bar / 2)} fill="var(--series-1)" opacity={hover == null || hover === i ? 1 : 0.45} />}
                {d.afterHours > 0 && <rect x={x} y={y(d.inHours + d.afterHours)} width={bar} height={Math.max(hAfter - gap / 2, 1)} rx={Math.min(4, bar / 2)} fill="var(--series-2)" opacity={hover == null || hover === i ? 1 : 0.45} />}
              </g>
            );
          })}
          <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} stroke="var(--axis)" strokeWidth={1} />
          {[0, Math.floor((data.length - 1) / 2), data.length - 1].filter((v, i, a) => data.length && a.indexOf(v) === i).map((i) => (
            <text key={i} x={PAD.l + i * slot + slot / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--muted)">{label(data[i].day)}</text>
          ))}
        </svg>
        {h && hover != null && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-md"
            style={{ left: `${((PAD.l + hover * slot + slot / 2) / W) * 100}%`, top: 0 }}
            role="status"
          >
            <p className="font-medium text-ink">{label(h.day)}</p>
            <p className="text-ink2">In office hours: <span className="num text-ink">{h.inHours}</span></p>
            <p className="text-ink2">After hours: <span className="num text-ink">{h.afterHours}</span></p>
          </div>
        )}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-ink2">View as table</summary>
        <div className="table-wrap mt-2 max-h-64 overflow-y-auto">
          <table className="data-table num">
            <thead><tr><th>Day</th><th>In office hours</th><th>After hours</th></tr></thead>
            <tbody>{data.map((d) => <tr key={d.day}><td>{label(d.day)}</td><td>{d.inHours}</td><td>{d.afterHours}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
