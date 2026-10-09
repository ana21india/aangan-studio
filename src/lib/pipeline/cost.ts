import type { Usage } from "../ai/gemini";
import type { CallEndedEvent } from "../voice/types";

export interface Rates {
  vaaniPerMinInr: number;
  geminiPerMInputInr: number;
  geminiPerMOutputInr: number;
}

export interface CostRow {
  line: "vaani_minutes" | "gemini_tokens" | "sms" | "fixed_monthly";
  quantity: number;
  unit_cost_inr: number;
  amount_inr: number;
}

const num = (v: string | undefined) => (v && Number.isFinite(Number(v)) ? Number(v) : 0);

export function ratesFromEnv(env: NodeJS.ProcessEnv = process.env): Rates {
  return {
    vaaniPerMinInr: num(env.COST_VAANI_PER_MIN_INR),
    geminiPerMInputInr: num(env.COST_GEMINI_PER_1M_INPUT_TOKENS_INR),
    geminiPerMOutputInr: num(env.COST_GEMINI_PER_1M_OUTPUT_TOKENS_INR),
  };
}

const round = (n: number) => Math.round(n * 10000) / 10000;

// Vaani minutes come from the provider's own cost figure when it supplies one, else duration x unit rate.
// Telegram messages are free, so there is no SMS line unless a paid SMS service is added later.
export function computeCosts(event: CallEndedEvent, usage: Usage | null, rates: Rates): CostRow[] {
  const rows: CostRow[] = [];

  if (event.channel === "phone" && event.durationSec != null && event.durationSec > 0) {
    const minutes = round(event.durationSec / 60);
    if (event.providerCostInr != null) {
      rows.push({ line: "vaani_minutes", quantity: minutes, unit_cost_inr: round(event.providerCostInr / minutes), amount_inr: round(event.providerCostInr) });
    } else {
      rows.push({ line: "vaani_minutes", quantity: minutes, unit_cost_inr: rates.vaaniPerMinInr, amount_inr: round(minutes * rates.vaaniPerMinInr) });
    }
  }

  if (usage && (usage.inputTokens > 0 || usage.outputTokens > 0)) {
    const inUnit = rates.geminiPerMInputInr / 1_000_000;
    const outUnit = rates.geminiPerMOutputInr / 1_000_000;
    rows.push({ line: "gemini_tokens", quantity: usage.inputTokens, unit_cost_inr: inUnit, amount_inr: round(usage.inputTokens * inUnit) });
    rows.push({ line: "gemini_tokens", quantity: usage.outputTokens, unit_cost_inr: outUnit, amount_inr: round(usage.outputTokens * outUnit) });
  }
  return rows;
}
