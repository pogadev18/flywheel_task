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
