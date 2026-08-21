# FAILURES.md

Running log of what broke, what I assumed, what it actually was, and what I changed.

---

## 1. Validator flagged a plan I had hand-written as "correct"

**What broke.** I wrote two synthetic plans to sanity-check `lib/validate.ts` without
burning a model call: one deliberately broken, one I believed was clean. The broken one
produced the 11 violations I expected. The "clean" one failed two rules.

**What I thought it was.** My first read was an off-by-one in `checkLongSessionShare` —
that I was dividing by the wrong week's volume, or including rest days wrongly in the
denominator.

**What it actually was.** My arithmetic, not the code. In my hand-written taper weeks the
long run was 6km out of a 16km week (37.5%) and 5km out of 13km (38.5%). Both genuinely
exceed the 35% cap. The rule that trips most easily is the interaction between rule 4
(longest session <= 35% of the week) and rule 6 (final week must taper): as weekly volume
falls, a long run that was fine at 40km/week becomes illegal at 16km/week. This is exactly
the class of bug a deterministic validator exists to catch, and it is precisely what an LLM
writing a taper week gets wrong.

**What I changed.** Nothing in the validator — it was right. I added an explicit line to
the repair prompt telling the model that changing one week's volume shifts the constraints
for every week after it, because the naive repair (shrink the final week) tends to create a
fresh `long_session_share` violation in that same week.

---

## 2. No local API key, so the LLM path could not be tested before deploying

**What broke.** I could not exercise `POST /api/plan` end to end on localhost.

**What I thought it was.** Initially a missing `.env.local`.

**What it actually was.** A standing constraint from the setup phase: the Anthropic key
lives only in Netlify's environment, never in a local file or a commit. So there is no local
key by design, and writing one would violate the constraint.

**What I changed.** Split the risk. Everything that does not need the key was verified
locally: `npx tsc --noEmit`, `npm run build`, and a compiled-to-JS harness in a scratch
directory that runs `validatePlan` against synthetic plans (this is what surfaced entry 1).
The model-dependent path was verified against the live production URL after deploy.

---
## 3. Live `POST /api/plan` returned HTTP 502 after 31 seconds

**What broke.** The first end-to-end call against production failed:
`{"errorType":"Error","errorMessage":"An unknown error has occurred"}` after 31.0s.
Locally the build was clean and the route typechecked.

**What I thought it was.** The generic Netlify error body reads like a crash inside the
handler, so my first guess was an unhandled exception in the SDK path — a bad `model` id, or
the `messages.create` call throwing something my `catch` didn't cover.

**What it actually was.** A timeout, not a crash. Netlify caps a synchronous function at
about 26 seconds; the request died at 31s wall clock. The route was doing up to three
sequential `messages.create` calls (generate + 2 repairs) inside a single HTTP request, and
even one generation of a 6-week × 7-day plan with prose notes is roughly 1,300 output tokens
— on its own that is already 15–25s. Three of them never had a chance. The generic error
body is what Netlify substitutes for a killed function, which is why it looked like a crash.

**What I changed.** Two things.

1. **Moved the loop to the client.** `POST /api/plan` now performs exactly ONE model call
   per request and returns that attempt plus its validation report and the model's raw
   reply. The browser drives generate → validate → repair, feeding the previous raw reply and
   the structured violations into the next request. The 3-attempt ceiling is enforced on both
   sides (`MAX_ATTEMPTS` in the client, and a `400` for `attempt > 3` in the route), so the
   loop still cannot run unbounded. The API key never leaves the server.
2. **Compacted the model's wire format.** The model now emits
   `{"w":[[["easy",8,"steady aerobic"], ...]]}` — positional arrays, minified, notes capped
   at 6 words — which the server expands into the documented `weeks[].days[]` shape. That is
   roughly half the output tokens, which pulls a single attempt well inside the ceiling.
   The public API response shape is unchanged.

The tradeoff: a user watching the network tab sees up to three requests instead of one, and
each repair re-sends the prior plan as context (which is why input tokens climb across
attempts in the run log). In exchange each request is bounded and the UI can report progress
between attempts instead of hanging for 30+ seconds.

---
## Verified live run (after the fix in entry 3)

Driving the real production endpoint the same way the browser does — half marathon,
6 weeks, 30 km/week, 5 days available:

```
attempt 1: valid=False failed=['volume_ramp', 'long_session_share'] viol=2 in=446  out=457 lat=8.9s  cost=$0.0082
attempt 2: valid=True  failed=[]                                    viol=0 in=1084 out=895 lat=12.9s cost=$0.0167
converged at attempt 2
```

That is the pipeline doing its job: the first plan ramped volume too fast and put too much
of a week into one session, the deterministic validator caught both without a model call,
and one repair round fixed them. Input tokens grow from 446 to 1084 on the repair because
the prior plan and the structured violations are fed back as context.
