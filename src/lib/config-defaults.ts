// Defaults for every behaviour setting. The database `config` table overrides these.
// Business rules live here and in the knowledge docs, not scattered through the code.
export const CONFIG_DEFAULTS = {
  PRICING_MODE: "none",
  AGENT_ACTIVE_HOURS: "all",
  QUALIFIED_THRESHOLD: 6,
  MIN_LEAD_WEEKS: 6,
  MERGE_WINDOW_MINUTES: 60,
  BUDGET_FLOOR_PCT: 60,
  BUDGET_MISMATCH_ACTION: "front_desk",
  // Internal minimums taken from pricing.md. Used only after the call, never by the live agent.
  BUDGET_FLOORS: { residential_per_sqft: 1800, commercial_per_sqft: 1200, single_room: 350000 },
  COMMERCIAL_MIN_SQFT_REVIEW: 500,
  TELEGRAM_NUDGE_MINUTES: 10,
  OVERDUE_HANDOFF_MINUTES: 120,
  RETENTION_RECORDING_DAYS: 90,
  RETENTION_TRANSCRIPT_DAYS: 365,
  OFFICE_HOURS_START: 10,
  OFFICE_HOURS_END: 19,
  // Demo mode: let a call with no phone number (a browser test call) through with a made-up number.
  ALLOW_UNKNOWN_CALLERS: false,
} as const;

export type AppConfig = {
  [K in keyof typeof CONFIG_DEFAULTS]: (typeof CONFIG_DEFAULTS)[K] extends number
    ? number
    : (typeof CONFIG_DEFAULTS)[K] extends string
      ? string
      : (typeof CONFIG_DEFAULTS)[K] extends boolean
        ? boolean
        : (typeof CONFIG_DEFAULTS)[K];
};

export function mergeConfig(overrides: Record<string, unknown>): AppConfig {
  return { ...CONFIG_DEFAULTS, ...overrides } as AppConfig;
}
