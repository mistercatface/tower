# Snake / flee AI — what’s left

One page. No pass names. Goal: **one decision engine, two config tables, zero duplicate species JS.**

Hygiene when touching this: [`hygiene.md`](hygiene.md) · [`stupid.md`](stupid.md) · [`objects.md`](objects.md) · [`frame.md`](frame.md)

---

## Goal

Every tick an agent gets **one `decisionContext`**: merged targets, path-step reach, threat/hunger facts, scored modes, chosen intent, sprint intent. Snake and flee differ only in **`Config/games/snake.js`** — not in parallel species derive functions or adapter callbacks.

---

## Already done (don’t regress)

- **Decision reach** — `syncNavReachHorizon` + `navReachStepsTo`; no `*Dist`, no per-tick `{ stepsTo() }` objects.
- **One context** — flat `decisionContext`; no `blackboard` / `decisionSnapshot` pair.
- **Shared agent layer** — slot merge, scorer registry, band tables, `gameDecisionContext.js` entry.
- **Hot-path wins** — nav topo for LOS, score-detail scratch pool, kinetic sleep without per-tick `Set`.
- **Hunger** — `foodFraction` + `hungerTier` from `hungerBands` + `bandFromThresholds`.

**Tests:** 70/70 on decision + ally + flee metabolism suites touched by steps 1–4.

**Still wrong (why step 6 is next):** flee steering still uses cell-pick heuristics; flow locomotion is gated until sprint consolidation is stable. ✅ Sprint is now one derive + config rules.

---

## The plan (do in order)

### 1 — Config owns slot merge ✅

Shipped: `decision` / `fleeAgent.decision` slot tables + `mergeSlotsFromSchema.js`.

---

### 2 — Engine owns scoring ✅

Shipped: `scoreDecisionModes.js` + `decision.modes` in config.

---

### 3 — Config owns bands ✅

Shipped: `hungerBands` + `bandFromThresholds` + `lookupBandTable`.

---

### 4 — Delete species decision models ✅

Shipped: deleted `*DecisionModel.js`; `gameDecisionContext.js` is the entry point.

---

### 5 — One sprint path ✅

**Shipped:** `deriveSprintIntent.js` + `sprint.rules` in config; `buildAgentDecisionContext` and flee latch call the same derive; species sprint functions and adapter callbacks removed.

---

### 6 — Flow locomotion ← **NEXT**

**Problem:** Flee still steers with cell-pick heuristics; crowds and smooth escape want local flow.

**Do:** Replace flee **steering** (not decision reach) with backward flow sampling at agent cell. Decision scoring **stays** on `navReachHorizon` — never per-agent flow windows on the utility hot path.

**Done when:** flee escape/regroup uses flow downhill; reach for scoring unchanged.

**Gate:** Step 5 merged ✅ — flow is unblocked.

---

## Optional (only if profiling says so)

- Reuse one `decisionContext` object per agent instance (mutate in place) instead of fresh object + spreads every tick.
- Nets-only pick — registry returns numbers; drop score-detail objects on hot path if scratch pool still smells.
- Drop `buildSnakeDecisionFrame` from public API; tests use full context build or stub `reachSteps` on a minimal bag.

---

## PR rules (every step)

- Net negative LOC unless you explain why in the PR.
- Snake **and** flee updated in the same PR when touching shared AI code.
- Tests migrate with the dialect — **no shims**, no “fix tests later.”
- No new getters, resolvers, `Libraries/AI/decision/` package, or passthrough wrappers.
- No second distance dialect — ever.

---

## What not to repeat

| Don’t | Do |
|-------|-----|
| Species `deriveFooSprintIntent` + adapter callback + spec hook | One derive; config rules; latch calls same function |
| Wrap a range check in objects | Scalar + band table |
| Magic strings that must match config by spelling | Band `id` / rule `id` declared in config; engine validates at load (optional follow-up) |

---

## Current files (ground truth)

| Role | File |
|------|------|
| Engine entry | `Libraries/AI/agents/buildAgentDecisionContext.js` |
| Game glue | `Libraries/AI/agents/gameDecisionContext.js` |
| Scoring | `Libraries/AI/agents/scoreDecisionModes.js` |
| Slots | `Libraries/AI/agents/mergeSlotsFromSchema.js` |
| Bands | `Libraries/AI/agents/bandFromThresholds.js` |
| Sprint | `Libraries/AI/agents/deriveSprintIntent.js` |
| Config | `Config/games/snake.js` |
| Reach (frozen) | `Libraries/Navigation/navReachHorizon.js` |

Ship log: [`fsm/history.md`](fsm/history.md) — archive only.
