import { SESSION_TYPES, type Plan } from "./types";

// Models sometimes wrap JSON in fences or add a sentence. Pull out the object,
// then check the shape ourselves so a bad shape is a structured failure, not a crash.
export function parsePlan(raw: string): { plan: Plan | null; error: string | null } {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) {
    return { plan: null, error: "no JSON object found in the response" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch (err) {
    return { plan: null, error: `JSON.parse failed: ${(err as Error).message}` };
  }

  const obj = parsed as Plan;
  if (!obj || !Array.isArray(obj.weeks) || obj.weeks.length === 0) {
    return { plan: null, error: "missing or empty 'weeks' array" };
  }

  for (const week of obj.weeks) {
    if (typeof week?.week !== "number" || !Array.isArray(week.days)) {
      return { plan: null, error: `week ${String(week?.week)} is missing 'week' number or 'days' array` };
    }
    for (const day of week.days) {
      if (typeof day?.day !== "number") {
        return { plan: null, error: `a day in week ${week.week} is missing its 'day' number` };
      }
      if (!SESSION_TYPES.includes(day.type)) {
        return {
          plan: null,
          error: `week ${week.week} day ${day.day} has type '${String(day.type)}', expected one of ${SESSION_TYPES.join(", ")}`,
        };
      }
      if (typeof day.distanceKm !== "number" || Number.isNaN(day.distanceKm)) {
        return { plan: null, error: `week ${week.week} day ${day.day} has a non-numeric distanceKm` };
      }
      if (typeof day.notes !== "string") {
        return { plan: null, error: `week ${week.week} day ${day.day} is missing 'notes'` };
      }
    }
  }

  return { plan: obj, error: null };
}
