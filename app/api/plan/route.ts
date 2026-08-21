import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

import { MODEL, costUsd } from "@/lib/anthropic";
import { parsePlan } from "@/lib/parse";
import { SYSTEM_PROMPT, repairPrompt, shapeRepairPrompt, userPrompt } from "@/lib/prompt";
import type { AttemptResponse, PlanRequest, Violation } from "@/lib/types";
import { validatePlan } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// One model call per request. The generate -> validate -> repair loop is driven by
// the client because Netlify caps a function at ~26s and three sequential
// generations do not fit inside one request. The bound is enforced on both sides.
export const MAX_ATTEMPTS = 3;

interface AttemptBody extends PlanRequest {
  attempt?: number;
  previousRaw?: string;
  violations?: Violation[];
  parseError?: string;
}

function parseRequest(body: unknown): { req: AttemptBody | null; error: string | null } {
  const b = body as Partial<AttemptBody>;
  const weeks = Number(b?.weeks);
  const currentWeeklyKm = Number(b?.currentWeeklyKm);
  const daysAvailable = Number(b?.daysAvailable);
  const attempt = Number(b?.attempt ?? 1);

  if (!b?.goal || typeof b.goal !== "string") return { req: null, error: "goal is required" };
  if (!Number.isFinite(weeks) || weeks < 2 || weeks > 16) {
    return { req: null, error: "weeks must be a number between 2 and 16" };
  }
  if (!Number.isFinite(currentWeeklyKm) || currentWeeklyKm < 0) {
    return { req: null, error: "currentWeeklyKm must be a non-negative number" };
  }
  if (!Number.isFinite(daysAvailable) || daysAvailable < 1 || daysAvailable > 7) {
    return { req: null, error: "daysAvailable must be between 1 and 7" };
  }
  if (!Number.isFinite(attempt) || attempt < 1 || attempt > MAX_ATTEMPTS) {
    return { req: null, error: `attempt must be between 1 and ${MAX_ATTEMPTS}` };
  }

  return {
    req: {
      goal: b.goal,
      weeks,
      currentWeeklyKm,
      daysAvailable,
      experience: typeof b.experience === "string" && b.experience ? b.experience : "unspecified",
      attempt,
      previousRaw: typeof b.previousRaw === "string" ? b.previousRaw : undefined,
      violations: Array.isArray(b.violations) ? b.violations : undefined,
      parseError: typeof b.parseError === "string" ? b.parseError : undefined,
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

  const attempt = req.attempt ?? 1;
  const messages: MessageParam[] = [{ role: "user", content: userPrompt(req) }];

  if (attempt > 1 && req.previousRaw) {
    messages.push({ role: "assistant", content: req.previousRaw });
    messages.push({
      role: "user",
      content: req.violations?.length
        ? repairPrompt(req.violations)
        : shapeRepairPrompt(req.parseError ?? "unparseable response"),
    });
  }

  const startedAt = Date.now();
  let message;
  try {
    message = await client(apiKey).messages.create({
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
    return Response.json(
      { ok: false, error: `model call failed on attempt ${attempt} (${detail})` },
      { status: 502 },
    );
  }

  const latencyMs = Date.now() - startedAt;
  const raw = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  const { plan, error: parseError } = parsePlan(raw);
  const validation = plan ? validatePlan(plan, req) : null;

  const payload: AttemptResponse = {
    ok: true,
    valid: Boolean(validation?.valid),
    plan,
    validation,
    raw,
    attempt: {
      attempt,
      repair: attempt > 1,
      valid: Boolean(validation?.valid),
      failedRules: validation ? validation.rules.filter((r) => !r.passed).map((r) => r.rule) : [],
      violationCount: validation ? validation.violations.length : 0,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      latencyMs,
      costUsd: costUsd(message.usage.input_tokens, message.usage.output_tokens),
      parseError,
    },
  };

  return Response.json(payload);
}

function client(apiKey: string) {
  return new Anthropic({ apiKey });
}
