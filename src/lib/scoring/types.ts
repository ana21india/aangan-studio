import { z } from "zod";

export const CriterionStatus = z.enum(["pass", "fail", "unclear"]);
export type CriterionStatus = z.infer<typeof CriterionStatus>;

export const CriterionResult = z.object({
  status: CriterionStatus,
  reason: z.string(),
});
export type CriterionResult = z.infer<typeof CriterionResult>;

// Fields pulled out of the transcript. null = the caller did not say; never guessed.
export const ExtractedFields = z.object({
  name: z.string().nullable(),
  space_type: z.enum(["home", "office", "other"]).nullable(),
  size_sqft: z.number().nullable(),
  location: z.string().nullable(),
  city: z.string().nullable(),
  scope: z.enum(["full_interior", "partial_home", "single_room", "renovation", "other"]).nullable(),
  timeline_text: z.string().nullable(),
  handover_date: z.string().nullable(),
  weeks_until_needed: z.number().nullable(),
  budget_text: z.string().nullable(),
  budget_inr_low: z.number().nullable(),
  budget_inr_high: z.number().nullable(),
  source: z.string().nullable(),
  decision_maker_note: z.string().nullable(),
  caller_asked_about: z.string().nullable(),
});
export type ExtractedFields = z.infer<typeof ExtractedFields>;

// Gemini's judgement on the four criteria that need reading comprehension.
// Budget (criterion 4) is decided in code from the extracted numbers.
export const Assessment = z.object({
  real_project: CriterionResult,
  service_area: CriterionResult,
  timeline: CriterionResult,
  decision_maker: CriterionResult,
  complaint_or_existing_client_issue: z.boolean(),
  asked_for_person: z.boolean(),
  uses_telegram: z.boolean().nullable(),
  score: z.number().min(0).max(10),
  confidence: z.enum(["high", "low"]),
  why_qualified: z.string(),
});
export type Assessment = z.infer<typeof Assessment>;

export type Category = "qualified" | "not_qualified" | "unsure";

export type EscalationReason =
  | "complaint"
  | "asked_for_person"
  | "unsure"
  | "missed_call"
  | "dropped_call"
  | "budget_mismatch"
  | "decision_maker"
  | "small_commercial";

export interface Outcome {
  category: Category;
  criteria: {
    real_project: CriterionResult;
    service_area: CriterionResult;
    timeline: CriterionResult;
    budget: CriterionResult;
    decision_maker: CriterionResult;
  };
  reasons: string[]; // one line per criterion, plus any extra notes
  notes: string[]; // uncertainties to show the designer
  escalation: { reason: EscalationReason; urgent: boolean } | null;
}
