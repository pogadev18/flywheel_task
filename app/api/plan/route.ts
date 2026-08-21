import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

import { MODEL, costUsd } from "@/lib/anthropic";
import { parsePlan } from "@/lib/parse";
import { SYSTEM_PROMPT, repairPrompt, shapeRepairPrompt, userPrompt } from "@/lib/prompt";
import type { AttemptLog, Plan, PlanRequest, PlanResponse, ValidationReport } from "@/lib/types";
import { validatePlan } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_REPAIRS = 2; // 1 generate + up to 2 repairs = 3 model calls, hard ceiling

function parseRequest(body: unknown): { req: PlanRequest | null; error: string | null } {
  const b = body as Partial<PlanRequest>;
  const weeks = Number(b?.weeks);
  const currentWeeklyKm = Number(b?.currentWeeklyKm);
  const daysAvailable = Number(b?.daysAvailable);

  if (!b?.goal || typeof b.goal !== "string") return { req: null, error: "goal is required" };
  if (!Number.isFinite(weeks) || weeks < 2 || weeks > 24) {
    return { req: null, error: "weeks must be a number between 2 and 24" };
  }
  if (!Number.isFinite(currentWeeklyKm) || currentWeeklyKm < 0) {
    return { req: null, error: "currentWeeklyKm must be a non-negative number" };
  }
  if (!Number.isFinite(daysAvailable) || daysAvailable < 1 || daysAvailable > 7) {
    return { req: null, error: "daysAvailable must be between 1 and 7" };
  }

  return {
    req: {
      goal: b.goal,
      weeks,
      currentWeeklyKm,
      daysAvailable,
      experience: typeof b.experience === "string" && b.experience ? b.experience : "unspecified",
    },
    error: null,
  };
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ ok: false, error: "no key" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "request body must be JSON" }, { status: 400 });
  }

  const { req, error: reqError } = parseRequest(body);
  if (!req) {
    return Response.json({ ok: false, error: reqError }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });
  const messages: MessageParam[] = [{ role: "user", content: userPrompt(req) }];
  const attempts: AttemptLog[] = [];

  let plan: Plan | null = null;
  let validation: ValidationReport | null = null;

  for (let attempt = 1; attempt <= MAX_REPAIRS + 1; attempt++) {
    const startedAt = Date.now();
    let message;
    try {
      message = await client.messages.create({
        model: MODEL,
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        messages,
      });
    } catch (err) {
      const detail =
        err instanceof Anthropic.APIError
          ? `${err.status ?? "api"}: ${err.name}`
          : err instanceof Error
            ? err.name
            : "unknown error";
      const payload: PlanResponse = {
        ok: false,
        valid: false,
        plan,
        validation,
        attempts,
        totals: totalsOf(attempts),
        error: `model call failed on attempt ${attempt} (${detail})`,
      };
      return Response.json(payload, { status: 502 });
    }

    const latencyMs = Date.now() - startedAt;
    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    const { plan: parsed, error: parseError } = parsePlan(text);

    if (parsed) {
      plan = parsed;
      validation = validatePlan(parsed, req);
    }

    attempts.push({
      attempt,
      repair: attempt > 1,
      valid: Boolean(parsed) && Boolean(validation?.valid),
      failedRules: validation && parsed ? validation.rules.filter((r) => !r.passed).map((r) => r.rule) : [],
      violationCount: parsed && validation ? validation.violations.length : 0,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      latencyMs,
      costUsd: costUsd(message.usage.input_tokens, message.usage.output_tokens),
      parseError,
    });

    if (parsed && validation?.valid) break;
    if (attempt === MAX_REPAIRS + 1) break; // out of retries — return the last attempt flagged invalid

    messages.push({ role: "assistant", content: text });
    messages.push({
      role: "user",
      content: parsed && validation ? repairPrompt(validation.violations) : shapeRepairPrompt(parseError ?? "unknown"),
    });
  }

  const payload: PlanResponse = {
    ok: true,
    valid: Boolean(validation?.valid),
    plan,
    validation,
    attempts,
    totals: totalsOf(attempts),
  };

  return Response.json(payload);
}

function totalsOf(attempts: AttemptLog[]) {
  return {
    attempts: attempts.length,
    inputTokens: attempts.reduce((s, a) => s + a.inputTokens, 0),
    outputTokens: attempts.reduce((s, a) => s + a.outputTokens, 0),
    latencyMs: attempts.reduce((s, a) => s + a.latencyMs, 0),
    costUsd: Math.round(attempts.reduce((s, a) => s + a.costUsd, 0) * 1_000_000) / 1_000_000,
  };
}
