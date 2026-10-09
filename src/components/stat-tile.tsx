// A single headline number. Labels are sentence case; the value uses proportional figures.
export function StatTile({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "good" | "warning" | "critical" }) {
  const toneClass = tone === "good" ? "text-good" : tone === "warning" ? "text-warning" : tone === "critical" ? "text-critical" : "text-ink";
  return (
    <div className="card">
      <p className="text-sm text-ink2">{label}</p>
      <p className={`mt-1 text-3xl font-semibold ${toneClass}`}>{value}</p>
      {note && <p className="mt-1 text-sm text-ink2">{note}</p>}
    </div>
  );
}

export function HeroFigure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="card">
      <p className="text-sm text-ink2">{label}</p>
      <p className="mt-1 text-6xl font-semibold text-ink">{value}</p>
      <p className="mt-2 text-sm text-ink2 max-w-xl">{note}</p>
    </div>
  );
}
