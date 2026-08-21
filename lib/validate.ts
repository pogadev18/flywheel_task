import type {
  Plan,
  PlanRequest,
  PlanWeek,
  RuleId,
  RuleResult,
  ValidationReport,
  Violation,
} from "./types";

// Deterministic, LLM-free plan validation.
// Every rule returns structured violations: { rule, week, day, detail }.

const RULE_DESCRIPTIONS: Record<RuleId, string> = {
  volume_ramp: "Weekly volume must not increase more than 10% vs the previous week",
  deload_cadence: "No 4+ consecutive weeks without a deload (>=25% volume drop)",
  back_to_back_hard: "No two hard days (intervals or long) back to back",
  long_session_share: "Longest session must be <= 35% of that week's volume",
  weekly_day_budget: "At least 1 rest day per week, and training days <= daysAvailable",
  final_week_taper: "Final week volume must drop vs the previous week",
};

const HARD_TYPES = new Set(["intervals", "long"]);

export function weekVolume(week: PlanWeek): number {
  return week.days.reduce((sum, d) => sum + (Number(d.distanceKm) || 0), 0);
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

function checkVolumeRamp(weeks: PlanWeek[]): Violation[] {
  const violations: Violation[] = [];
  for (let i = 1; i < weeks.length; i++) {
    const prev = weekVolume(weeks[i - 1]);
    const curr = weekVolume(weeks[i]);
    if (prev <= 0) continue;
    const pct = ((curr - prev) / prev) * 100;
    if (pct > 10) {
      violations.push({
        rule: "volume_ramp",
        week: weeks[i].week,
        day: null,
        detail: `Week ${weeks[i].week} volume ${round(curr)}km is ${round(pct)}% above week ${weeks[i - 1].week} (${round(prev)}km). Max allowed increase is 10% (${round(prev * 1.1)}km).`,
      });
    }
  }
  return violations;
}

function checkDeloadCadence(weeks: PlanWeek[]): Violation[] {
  const violations: Violation[] = [];
  // A week is a deload if its volume is >=25% below the previous week.
  // Week 1 has no previous week, so it can never be a deload.
  const isDeload = weeks.map((w, i) => {
    if (i === 0) return false;
    const prev = weekVolume(weeks[i - 1]);
    if (prev <= 0) return false;
    return (prev - weekVolume(w)) / prev >= 0.25;
  });

  let streak = 0;
  for (let i = 0; i < weeks.length; i++) {
    if (isDeload[i]) {
      streak = 0;
      continue;
    }
    streak++;
    if (streak >= 4) {
      const from = weeks[i - streak + 1].week;
      violations.push({
        rule: "deload_cadence",
        week: weeks[i].week,
        day: null,
        detail: `Weeks ${from}-${weeks[i].week} (${streak} consecutive weeks) contain no deload. Insert a week whose volume is at least 25% below the week before it.`,
      });
      streak = 0; // report once per run, then restart the count
    }
  }
  return violations;
}

function checkBackToBackHard(weeks: PlanWeek[]): Violation[] {
  const violations: Violation[] = [];
  // Flattened across the whole plan so week boundaries are checked too.
  const flat = weeks.flatMap((w) => w.days.map((d) => ({ week: w.week, day: d })));
  for (let i = 1; i < flat.length; i++) {
    const prev = flat[i - 1];
    const curr = flat[i];
    if (HARD_TYPES.has(prev.day.type) && HARD_TYPES.has(curr.day.type)) {
      violations.push({
        rule: "back_to_back_hard",
        week: curr.week,
        day: curr.day.day,
        detail: `Hard day '${curr.day.type}' (week ${curr.week} day ${curr.day.day}) directly follows hard day '${prev.day.type}' (week ${prev.week} day ${prev.day.day}). Put an easy, strength or rest day between them.`,
      });
    }
  }
  return violations;
}

function checkLongSessionShare(weeks: PlanWeek[]): Violation[] {
  const violations: Violation[] = [];
  for (const w of weeks) {
    const volume = weekVolume(w);
    if (volume <= 0) continue;
    for (const d of w.days) {
      const km = Number(d.distanceKm) || 0;
      const share = (km / volume) * 100;
      if (share > 35) {
        violations.push({
          rule: "long_session_share",
          week: w.week,
          day: d.day,
          detail: `Week ${w.week} day ${d.day} is ${round(km)}km = ${round(share)}% of the week's ${round(volume)}km. Cap any single session at 35% (${round(volume * 0.35)}km).`,
        });
      }
    }
  }
  return violations;
}

function checkWeeklyDayBudget(weeks: PlanWeek[], daysAvailable: number): Violation[] {
  const violations: Violation[] = [];
  for (const w of weeks) {
    const restDays = w.days.filter((d) => d.type === "rest").length;
    const trainingDays = w.days.length - restDays;
    if (restDays < 1) {
      violations.push({
        rule: "weekly_day_budget",
        week: w.week,
        day: null,
        detail: `Week ${w.week} has ${restDays} rest days. Every week needs at least 1 rest day.`,
      });
    }
    if (trainingDays > daysAvailable) {
      violations.push({
        rule: "weekly_day_budget",
        week: w.week,
        day: null,
        detail: `Week ${w.week} has ${trainingDays} training days but the athlete only has ${daysAvailable} days available.`,
      });
    }
  }
  return violations;
}

function checkFinalWeekTaper(weeks: PlanWeek[]): Violation[] {
  if (weeks.length < 2) return [];
  const last = weeks[weeks.length - 1];
  const prev = weeks[weeks.length - 2];
  const lastVol = weekVolume(last);
  const prevVol = weekVolume(prev);
  if (lastVol >= prevVol) {
    return [
      {
        rule: "final_week_taper",
        week: last.week,
        day: null,
        detail: `Final week ${last.week} is ${round(lastVol)}km vs ${round(prevVol)}km in week ${prev.week}. The last week must taper — reduce it below the previous week.`,
      },
    ];
  }
  return [];
}

export function validatePlan(
  plan: Plan,
  req: Pick<PlanRequest, "daysAvailable">,
): ValidationReport {
  const weeks = plan.weeks ?? [];

  const byRule: Record<RuleId, Violation[]> = {
    volume_ramp: checkVolumeRamp(weeks),
    deload_cadence: checkDeloadCadence(weeks),
    back_to_back_hard: checkBackToBackHard(weeks),
    long_session_share: checkLongSessionShare(weeks),
    weekly_day_budget: checkWeeklyDayBudget(weeks, req.daysAvailable),
    final_week_taper: checkFinalWeekTaper(weeks),
  };

  const rules: RuleResult[] = (Object.keys(RULE_DESCRIPTIONS) as RuleId[]).map((rule) => ({
    rule,
    description: RULE_DESCRIPTIONS[rule],
    passed: byRule[rule].length === 0,
    violations: byRule[rule],
  }));

  const violations = rules.flatMap((r) => r.violations);

  return { valid: violations.length === 0, rules, violations };
}
