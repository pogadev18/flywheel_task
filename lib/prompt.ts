import type { PlanRequest, Violation } from "./types";

// Compact wire format. The model emits positional arrays, not the full object
// shape, because Netlify's function ceiling is ~26s and verbose JSON for a
// multi-week plan costs enough output tokens to blow through it. The server
// expands this back into the documented {weeks[].days[]} shape.
export const PLAN_SCHEMA = `{"w":[[["type",distanceKm,"notes"], ...7 days...], ...N weeks...]}`;

export const SYSTEM_PROMPT = `You write training plans for endurance athletes and gym-goers who train WITHOUT a coach.

Reply with ONE minified JSON object and nothing else. No prose, no markdown fences, no whitespace.

Format:
${PLAN_SCHEMA}

- "w" is an array of weeks, in order. Each week is an array of exactly 7 days, in order.
- Each day is a 3-element array: [type, distanceKm, notes].
- type is one of: "easy", "long", "intervals", "rest", "strength".
- distanceKm is a number. Use 0 for rest and strength.
- notes is a coaching cue of AT MOST 6 words. Never empty.

The plan is checked by a deterministic validator. It must satisfy ALL of:
1. Weekly volume never increases more than 10% over the previous week.
2. No 4 consecutive weeks without a deload week (a week at least 25% below the week before it).
3. Never two hard days in a row (hard = intervals or long), including across a week boundary.
4. No single session exceeds 35% of that week's total volume.
5. Every week has at least 1 rest day, and no more training days than the athlete has available.
6. The final week tapers: its volume is lower than the week before it.

Rules 4 and 6 interact: as the taper drops weekly volume, the long run must shrink with it.`;

export function userPrompt(req: PlanRequest): string {
  return `Athlete:
- Goal: ${req.goal}
- Plan length: ${req.weeks} weeks
- Current weekly volume: ${req.currentWeeklyKm} km
- Days available per week: ${req.daysAvailable}
- Experience: ${req.experience}

Week 1 volume should be close to the athlete's current weekly volume. Return exactly ${req.weeks} weeks of 7 days.`;
}

export function repairPrompt(violations: Violation[]): string {
  return `The deterministic validator rejected that plan. Violations:

${JSON.stringify(violations)}

Fix every violation and return the COMPLETE corrected plan in the same minified format, same number of weeks. Do not explain. Changing one week's volume shifts the constraints for every week after it — re-check the whole plan before answering.`;
}

export function shapeRepairPrompt(error: string): string {
  return `That response could not be parsed: ${error}

Return one minified JSON object in the documented format. No fences, no prose.`;
}
