# aitrainingplan.app — generate → validate → repair

**Live app: https://flywheel-task.netlify.app**

A two-step pipeline that writes training plans for endurance athletes and gym-goers who
train without a coach, then checks the plan with deterministic code instead of trusting the
model.

## How it works

1. **Generate** — `POST /api/plan` calls `claude-sonnet-4-6` and asks for a structured plan:
   `weeks[] -> days[] -> {type, distanceKm, notes}`.
2. **Validate** — [`lib/validate.ts`](lib/validate.ts) runs six deterministic rules. **No LLM
   call.** Each failure is structured — `{rule, week, day, detail}` — not a string.
3. **Repair** — failures are fed back to the model verbatim and the plan is regenerated.
   Bounded at 1 generate + 2 repairs; an exhausted budget returns the last attempt flagged
   invalid with its outstanding violations shown.

## The rules

| Rule | Fails when |
|---|---|
| `volume_ramp` | Weekly volume increases more than 10% over the previous week |
| `deload_cadence` | 4+ consecutive weeks with no deload (a week ≥25% below the one before it) |
| `back_to_back_hard` | Two hard days (`intervals` or `long`) in a row, including across a week boundary |
| `long_session_share` | Any single session exceeds 35% of that week's volume |
| `weekly_day_budget` | Fewer than 1 rest day per week, or more training days than the athlete has available |
| `final_week_taper` | The final week does not drop in volume vs the previous week |

## Observability

Every attempt is logged with its attempt number, which rules failed, input/output tokens,
latency and cost. The log ships in the API response and is rendered under the validation
panel in the UI.

## Notes

- The repair loop runs in the browser, one model call per request — Netlify kills a
  synchronous function at ~26s and three sequential generations do not fit in one request.
  The 3-attempt ceiling is enforced on both the client and the route. The API key never
  leaves the server.
- [`FAILURES.md`](FAILURES.md) is a running log of what broke during the build, what I
  assumed it was, and what it actually was.

## Local development

```bash
npm install
npm run dev
```

`ANTHROPIC_API_KEY` must be set in the environment for `/api/plan` to work. It is never
committed — in production it lives in Netlify's environment variables.
