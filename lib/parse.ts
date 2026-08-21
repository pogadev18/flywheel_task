import { SESSION_TYPES, type Plan, type SessionType } from "./types";

type CompactDay = [string, number, string];

// Expand the compact wire format into the documented plan shape, checking every
// field. A bad shape is a structured failure the repair loop can act on, not a crash.
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

  const weeksRaw = (parsed as { w?: unknown })?.w;
  if (!Array.isArray(weeksRaw) || weeksRaw.length === 0) {
    return { plan: null, error: "missing or empty 'w' array" };
  }

  const weeks = [];
  for (let wi = 0; wi < weeksRaw.length; wi++) {
    const daysRaw = weeksRaw[wi];
    if (!Array.isArray(daysRaw) || daysRaw.length === 0) {
      return { plan: null, error: `week ${wi + 1} is not a non-empty array of days` };
    }

    const days = [];
    for (let di = 0; di < daysRaw.length; di++) {
      const d = daysRaw[di] as CompactDay;
      if (!Array.isArray(d) || d.length < 3) {
        return { plan: null, error: `week ${wi + 1} day ${di + 1} is not a [type, distanceKm, notes] array` };
      }
      if (!SESSION_TYPES.includes(d[0] as SessionType)) {
        return {
          plan: null,
          error: `week ${wi + 1} day ${di + 1} has type '${String(d[0])}', expected one of ${SESSION_TYPES.join(", ")}`,
        };
      }
      const km = Number(d[1]);
      if (!Number.isFinite(km) || km < 0) {
        return { plan: null, error: `week ${wi + 1} day ${di + 1} has a non-numeric distanceKm` };
      }
      days.push({
        day: di + 1,
        type: d[0] as SessionType,
        distanceKm: km,
        notes: typeof d[2] === "string" && d[2] ? d[2] : "—",
      });
    }

    weeks.push({ week: wi + 1, days });
  }

  return { plan: { weeks }, error: null };
}
