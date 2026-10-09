import { describe, expect, it } from "vitest";
import { budgetCriterion, deriveOutcome } from "../src/lib/scoring/rules";
import { analysis, cfg, emptyFields, goodAssessment } from "./helpers";

const fail = (reason = "no") => ({ status: "fail" as const, reason });
const unclear = (reason = "?") => ({ status: "unclear" as const, reason });
const run = (f = {}, a = {}) => {
  const x = analysis(f, a);
  return deriveOutcome(x.fields, x.assessment, cfg);
};

describe("deriveOutcome (Nikhil's five criteria)", () => {
  it("qualifies when everything passes", () => {
    const o = run();
    expect(o.category).toBe("qualified");
    expect(o.escalation).toBeNull();
  });

  it("declines when the site is outside Pune (T03)", () => {
    expect(run({}, { service_area: fail("Nashik") }).category).toBe("not_qualified");
  });

  it("declines advice-only enquiries (T04) and timelines that are too short (F08)", () => {
    expect(run({}, { real_project: fail() }).category).toBe("not_qualified");
    expect(run({}, { timeline: fail() }).category).toBe("not_qualified");
  });

  it("sends an unclear criterion 1, 2 or 3 to the front desk as unsure", () => {
    for (const k of ["real_project", "service_area", "timeline"] as const) {
      const o = run({}, { [k]: unclear() });
      expect(o.category).toBe("unsure");
      expect(o.escalation?.reason).toBe("unsure");
    }
  });

  it("treats unclear decision-maker as qualified with a note (T14)", () => {
    const o = run({ decision_maker_note: "Parents decide" }, { decision_maker: unclear("son is checking for parents") });
    expect(o.category).toBe("qualified");
    expect(o.notes.join(" ")).toMatch(/Decision-maker unclear/);
  });

  it("sends a failed decision-maker to the front desk, not an automatic decline (D-012)", () => {
    const o = run({}, { decision_maker: fail("only researching for in-laws") });
    expect(o.category).toBe("unsure");
    expect(o.escalation?.reason).toBe("decision_maker");
  });

  it("routes a clearly low volunteered budget to the front desk (T10, D-005)", () => {
    const o = run({ scope: "partial_home", budget_inr_low: 100000, budget_inr_high: 150000 });
    expect(o.category).toBe("unsure");
    expect(o.escalation?.reason).toBe("budget_mismatch");
  });

  it("declines when two criteria fail, even if one is budget", () => {
    const o = run({ scope: "partial_home", budget_inr_high: 150000 }, { service_area: fail("Talegaon") });
    expect(o.category).toBe("not_qualified");
  });

  it("does not penalise a missing budget", () => {
    expect(budgetCriterion(analysis().fields, cfg).status).toBe("pass");
  });

  it("accepts a plausible budget: F10 is 18-22 lakh for 1,300 sq ft", () => {
    const f = { ...analysis().fields, size_sqft: 1300, budget_inr_low: 1800000, budget_inr_high: 2200000 };
    expect(budgetCriterion(f, cfg).status).toBe("pass");
  });

  it("sends very small commercial spaces to the front desk (T18, D-017)", () => {
    const o = run({ space_type: "office", size_sqft: 180 });
    expect(o.category).toBe("unsure");
    expect(o.escalation?.reason).toBe("small_commercial");
  });

  it("treats complaints as urgent escalations, not enquiries (T09)", () => {
    const o = run({}, { complaint_or_existing_client_issue: true });
    expect(o.category).toBe("unsure");
    expect(o.escalation).toEqual({ reason: "complaint", urgent: true });
  });

  it("escalates callers who ask for a person", () => {
    expect(run({}, { asked_for_person: true }).escalation?.reason).toBe("asked_for_person");
  });

  it("gives one reason line per criterion", () => {
    expect(run().reasons).toHaveLength(5);
    expect(goodAssessment.score).toBe(8);
    expect(emptyFields.name).toBeNull();
  });
});
