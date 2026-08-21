export type SessionType = "easy" | "long" | "intervals" | "rest" | "strength";

export const SESSION_TYPES: SessionType[] = [
  "easy",
  "long",
  "intervals",
  "rest",
  "strength",
];

export interface PlanDay {
  day: number;
  type: SessionType;
  distanceKm: number;
  notes: string;
}

export interface PlanWeek {
  week: number;
  days: PlanDay[];
}

export interface Plan {
  weeks: PlanWeek[];
}

export interface PlanRequest {
  goal: string;
  weeks: number;
  currentWeeklyKm: number;
  daysAvailable: number;
  experience: string;
}

export type RuleId =
  | "volume_ramp"
  | "deload_cadence"
  | "back_to_back_hard"
  | "long_session_share"
  | "weekly_day_budget"
  | "final_week_taper";

export interface Violation {
  rule: RuleId;
  week: number;
  day: number | null;
  detail: string;
}

export interface RuleResult {
  rule: RuleId;
  description: string;
  passed: boolean;
  violations: Violation[];
}

export interface ValidationReport {
  valid: boolean;
  rules: RuleResult[];
  violations: Violation[];
}

export interface AttemptLog {
  attempt: number;
  repair: boolean;
  valid: boolean;
  failedRules: RuleId[];
  violationCount: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsd: number;
  parseError: string | null;
}

export interface PlanResponse {
  ok: boolean;
  valid: boolean;
  plan: Plan | null;
  validation: ValidationReport | null;
  attempts: AttemptLog[];
  totals: {
    attempts: number;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    costUsd: number;
  };
  error?: string;
}
