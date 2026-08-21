import type { PlanRequest, Violation } from "./types";

// The JSON schema is stated in the prompt (not enforced server-side) so that
// a shape miss is a normal, observable failure the repair loop can fix.
export const PLAN_SCHEMA = `{
  "weeks": [
    {
      "week": 1,
      "days": [
        {
          "day": 1,
          "type": "easy" | "long" | "intervals" | "rest" | "strength",
          "distanceKm": 8.0,
          "notes": "short coaching cue, max 12 words"
        }
      ]
    }
  ]
}`;

export const SYSTEM_PROMPT = `You write training plans for endurance athletes and gym-goers who train WITHOUT a coach.

Reply with ONE JSON object and nothing else. No prose, no markdown fences.

Schema:
${PLAN_SCHEMA}

Shape requirements:
- "weeks" has exactly the requested number of weeks, numbered 1..N.
- Every week has exactly 7 days, numbered 1..7.
- "type" is one of: easy, long, intervals, rest, strength.
- "distanceKm" is a number. Use 0 for rest and for strength sessions.
- "notes" is a short string, never empty.

The plan is checked by a deterministic validator. It must satisfy ALL of:
1. Weekly volume never increases more than 10% over the previous week.
2. No 4 consecutive weeks without a deload week (a week at least 25% below the week before it).
3. Never two hard days in a row (hard = intervals or long), including across a week boundary.
4. No single session exceeds 35% of that week's total volume.
5. Every week has at least 1 rest day, and no more training days than the athlete has available.
6. The final week tapers: its volume is lower than the week before it.`;

export function userPrompt(req: PlanRequest): string {
  return `Athlete:
- Goal: ${req.goal}
- Plan length: ${req.weeks} weeks
- Current weekly volume: ${req.currentWeeklyKm} km
- Days available per week: ${req.daysAvailable}
- Experience: ${req.experience}

Week 1 volume should be close to the athlete's current weekly volume. Return the JSON object.`;
}

export function repairPrompt(violations: Violation[]): string {
  return `The deterministic validator rejected that plan. Violations:

${JSON.stringify(violations, null, 2)}

Fix every violation and return the COMPLETE corrected plan as one JSON object, same schema, same number of weeks. Do not explain. Changing one week's volume shifts the ramp for the weeks after it — re-check the whole plan before answering.`;
}

export function shapeRepairPrompt(error: string): string {
  return `That response could not be parsed as a valid plan: ${error}

Return one JSON object matching the schema exactly. No markdown fences, no prose.`;
}
