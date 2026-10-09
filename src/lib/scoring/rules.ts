import type { AppConfig } from "../config-defaults";
import type {
  Assessment,
  CriterionResult,
  ExtractedFields,
  Outcome,
} from "./types";

// Criterion 4 (budget) is decided here, from numbers the caller volunteered. We never ask for a budget.
// A volunteered figure clearly below the internal minimum for the scope is flagged for the front desk.
export function budgetCriterion(f: ExtractedFields, cfg: AppConfig): CriterionResult {
  const stated = f.budget_inr_high ?? f.budget_inr_low;
  if (stated == null) {
    return { status: "pass", reason: "No budget mentioned, treated as fine." };
  }

  const floors = cfg.BUDGET_FLOORS;
  let minimum: number | null = null;
  let basis = "";
  if (f.scope === "single_room" || f.scope === "partial_home") {
    minimum = floors.single_room;
    basis = "a single room or partial-home project";
  } else if (f.size_sqft != null && f.space_type === "home") {
    minimum = floors.residential_per_sqft * f.size_sqft;
    basis = `${f.size_sqft} sq ft of home`;
  } else if (f.size_sqft != null && f.space_type === "office") {
    minimum = floors.commercial_per_sqft * f.size_sqft;
    basis = `${f.size_sqft} sq ft of office`;
  }
  if (minimum == null) {
    return { status: "unclear", reason: "Budget given but scope or size too vague to compare." };
  }

  const threshold = (minimum * cfg.BUDGET_FLOOR_PCT) / 100;
  if (stated < threshold) {
    return {
      status: "fail",
      reason: `Stated budget (up to INR ${stated.toLocaleString("en-IN")}) looks clearly below what ${basis} usually needs.`,
    };
  }
  return { status: "pass", reason: "Stated budget is plausible for the scope." };
}

// Turns the five criteria into a category, following Nikhil's boundary rules (qualified.md, DECISIONS.md).
export function deriveOutcome(
  fields: ExtractedFields,
  a: Assessment,
  cfg: AppConfig,
): Outcome {
  const budget = budgetCriterion(fields, cfg);
  const criteria = {
    real_project: a.real_project,
    service_area: a.service_area,
    timeline: a.timeline,
    budget,
    decision_maker: a.decision_maker,
  };
  const reasons = [
    `Real project: ${criteria.real_project.reason}`,
    `Service area: ${criteria.service_area.reason}`,
    `Timeline: ${criteria.timeline.reason}`,
    `Budget: ${criteria.budget.reason}`,
    `Decision-maker: ${criteria.decision_maker.reason}`,
  ];
  const notes: string[] = [];
  const base = { criteria, reasons, notes };

  // Not an enquiry: an upset or existing client, or someone asking for a person.
  if (a.complaint_or_existing_client_issue) {
    return { ...base, category: "unsure", escalation: { reason: "complaint", urgent: true } };
  }
  if (a.asked_for_person) {
    return { ...base, category: "unsure", escalation: { reason: "asked_for_person", urgent: false } };
  }

  const fails = (Object.keys(criteria) as (keyof typeof criteria)[]).filter(
    (k) => criteria[k].status === "fail",
  );

  // Budget alone failing, or decision-maker alone failing, goes to a human instead of an automatic decline.
  if (fails.length === 1 && fails[0] === "budget" && cfg.BUDGET_MISMATCH_ACTION === "front_desk") {
    return { ...base, category: "unsure", escalation: { reason: "budget_mismatch", urgent: false } };
  }
  if (fails.length === 1 && fails[0] === "decision_maker") {
    return { ...base, category: "unsure", escalation: { reason: "decision_maker", urgent: false } };
  }
  if (fails.length > 0) {
    return { ...base, category: "not_qualified", escalation: null };
  }

  // Very small commercial space: a person decides (DECISIONS.md D-017).
  if (
    fields.space_type === "office" &&
    fields.size_sqft != null &&
    fields.size_sqft < cfg.COMMERCIAL_MIN_SQFT_REVIEW
  ) {
    return { ...base, category: "unsure", escalation: { reason: "small_commercial", urgent: false } };
  }

  // Unclear on 1, 2 or 3: the agent should have asked one question; still unclear means a human follows up.
  if (
    criteria.real_project.status === "unclear" ||
    criteria.service_area.status === "unclear" ||
    criteria.timeline.status === "unclear"
  ) {
    return { ...base, category: "unsure", escalation: { reason: "unsure", urgent: false } };
  }

  // Unclear on 4 or 5: do not push. Qualified, with the uncertainty noted for the designer.
  if (criteria.budget.status === "unclear") notes.push(`Budget unclear: ${criteria.budget.reason}`);
  if (criteria.decision_maker.status === "unclear") {
    notes.push(`Decision-maker unclear: ${criteria.decision_maker.reason}`);
  }
  if (fields.decision_maker_note) notes.push(`Decision-maker: ${fields.decision_maker_note}`);
  return { ...base, category: "qualified", escalation: null };
}
