import type { Assessment, ExtractedFields, Outcome } from "../scoring/types";

const SCOPE_LABEL: Record<string, string> = {
  full_interior: "full interior",
  partial_home: "partial home",
  single_room: "single room",
  renovation: "renovation",
  other: "other",
};

const dash = (v: string | number | null | undefined) => (v == null || v === "" ? "not said" : String(v));

// The designer handoff, in the format agreed in the build brief. Built in code so it is always the same shape.
export function buildHandoffNote(args: {
  fields: ExtractedFields;
  assessment: Assessment;
  outcome: Outcome;
  phone: string;
  transcriptUrl: string;
}): string {
  const { fields: f, assessment: a, outcome, phone, transcriptUrl } = args;
  const space = [f.space_type === "home" ? "home" : f.space_type === "office" ? "office" : f.space_type, f.size_sqft ? `~${f.size_sqft.toLocaleString("en-IN")} sq ft` : null]
    .filter(Boolean)
    .join(", ");
  const place = [f.location, f.city].filter(Boolean).join(", ");
  const timeline = [f.timeline_text, f.handover_date ? `handover ${f.handover_date}` : null].filter(Boolean).join(" · ");

  const lines = [
    `New qualified enquiry · score ${Math.round(a.score)}/10`,
    `Name: ${dash(f.name)} · Phone: ${phone}`,
    `Space: ${dash(space || null)} · Location: ${dash(place || null)}`,
    `Scope: ${dash(f.scope ? SCOPE_LABEL[f.scope] : null)} · Timeline: ${dash(timeline || null)}`,
    `Budget: ${dash(f.budget_text)} · Source: ${dash(f.source)}`,
    `Why qualified: ${a.why_qualified}`,
    `Caller asked about: ${dash(f.caller_asked_about)}`,
  ];
  if (outcome.notes.length) lines.push(`Note for designer: ${outcome.notes.join(" ")}`);
  lines.push(`Transcript: ${transcriptUrl}`);
  return lines.join("\n");
}
