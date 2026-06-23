# Snake / flee AI — what’s left

One page. No pass names. Goal: **one decision engine, two config tables, zero duplicate species JS.**

Hygiene when touching this: [`hygiene.md`](hygiene.md) · [`stupid.md`](stupid.md) · [`objects.md`](objects.md) · [`frame.md`](frame.md)

---

## Goal

Every tick an agent gets **one `decisionContext`**: merged targets, path-step reach, threat/hunger facts, scored modes, chosen intent, sprint intent. Snake and flee differ only in **`Config/games/snake.js`** — not in parallel `*DecisionModel.js` files.

---

## Already done (don’t regress)

- **Decision reach** — `syncNavReachHorizon` + `navReachStepsTo`; no `*Dist`, no per-tick `{ stepsTo }` objects.
- **One context** — flat `decisionContext`; no `blackboard` / `decisionSnapshot` pair.
- **Shared agent layer** — `buildAgentRemembered`, `buildAgentEventTargets`, `deriveThreatState`, `deriveAllyState`, `buildAgentDecisionContext`.
- **Hot-path wins** — nav topo for LOS (no per-ray graph view), score-detail scratch pool, kinetic sleep without per-tick `Set`.
- **Hunger** — `foodFraction` on context + `hungerTier` string (`"satisfied" | "hungry" | "desperate" | null`); no hunger objects.

**Tests:** 50/50 on `snakeDecisionModel.test.js` + `fleeAgentDecision.test.js`.

**Still wrong (why this doc exists):** snake and flee each have ~150 lines of duplicate spec/scorer JS; hunger thresholds and tier names live in three places; band logic is copy-pasted ternaries; every new banded scalar will hurt unless step 3 happens.

---

## The plan (do in order)

### 1 — Config owns slot merge ✅

**Problem:** `snakeDecisionModel.js` and `fleeDecisionModel.js` each define `buildVisible`, remembered slot arrays, and known-target merge (flee’s enemy←prey alias, memory gating, snake engaged-ally filter).

**Shipped:** `Config/games/snake.js` → `decision` + `fleeAgent.decision` slot tables; `mergeSlotsFromSchema.js` (declarative field rules + sole `engagedAlly` merge hook); engine reads schema via `spec.decisionSchema()`.

**Done when:** no `buildVisible` / `buildRemembered` / `buildKnown` closures in `Libraries/Game/snake/*DecisionModel.js`; both species read slots from config. ✅

---

### 2 — Engine owns scoring ✅

**Shipped:** `scoreDecisionModes.js` registry; `decision.modes` in config for snake + flee; guards/mods as closed enums; species files only export thin test wrappers + sprint/engagement hooks.

**Done when:** no `function score*Detail` in game JS. ✅ (wrappers delegate to engine)

---

### 3 — Config owns bands (hunger first, generic forever)

**Problem:** Hunger uses `satisfiedAtOrAbove` + `desperateBelow` in one place, magic strings in JS, and `riskTolerance.satisfied` / `costPerCell.desperate` in another. Middle band `"hungry"` isn’t declared anywhere.

**Do:**

1. One band table format in config, e.g. ordered `{ id, min }` thresholds (highest first).
2. One engine helper: `bandFromThresholds(value, bands) → id | null` and `lookupBandTable(table, id, fallback)`.
3. Replace duplicated hunger ternaries in `buildAgentDecisionContext` / `buildSnakeDecisionFrame` with config + helper.
4. Sprint derive uses the same band ids + sprint table from config — one `deriveSprintFromConfig`, not snake/flee copies.

**Done when:** adding a second banded scalar (stamina, morale, …) is config + registry guard — not a new derive function and three file grep sync.

---

### 4 — Delete species decision models

**Problem:** `snakeDecisionModel.js` and `fleeDecisionModel.js` are leftover adapters that should be data.

**Do:**

1. Delete both files.
2. Intent adapters call `buildDecisionContext(getSnakeGameConfig().decision, input)` / `fleeAgent.decision` directly.
3. Move snake-only hooks (`deriveSnakeEngagementState`, faction prey logic) to small engine hook table referenced by id from config — not a whole decision model file.
4. Migrate tests to import engine + config; drop wrappers like `buildSnakeDecisionContext` unless tests truly need them.

**Done when:**

```bash
rg 'snakeDecisionModel|fleeDecisionModel' --glob '*.js'   # zero outside history/comments
rg 'function scorePreyDetail|function scoreFoodDetail' Libraries/Game/snake
```

Net **negative** line count vs today.

---

### 5 — Flow locomotion (after 4, or flee-only slice in parallel)

**Problem:** Flee still steers with cell-pick heuristics; crowds and smooth escape want local flow.

**Do:** Replace flee **steering** (not decision reach) with backward flow sampling at agent cell. Decision scoring **stays** on `navReachHorizon` — never per-agent flow windows on the utility hot path.

**Done when:** flee escape/regroup uses flow downhill; reach for scoring unchanged; Part 1 grep gates still clean.

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

## What not to repeat (hunger lesson)

| Don’t | Do |
|-------|-----|
| Wrap a range check in objects then “optimize” the objects | Store the scalar; derive band id from config when needed |
| One-off `deriveFooFromConfig` per banded stat | One `bandFromThresholds` + config tables |
| Hoist into agent layer before config step deletes the hoist | Steps 1→4 in order; don’t add layers H2d would remove |
| Magic strings in JS that must match config keys by spelling | Band `id` declared once in config; engine only uses those ids |

---

## Current files (ground truth)

| Role | File |
|------|------|
| Engine entry | `Libraries/AI/agents/buildAgentDecisionContext.js` |
| Scoring | `Libraries/AI/utility/utilityScoring.js` |
| Snake adapter (delete in step 4) | `Libraries/Game/snake/snakeDecisionModel.js` |
| Flee adapter (delete in step 4) | `Libraries/Game/snake/fleeAgent/fleeDecisionModel.js` |
| Config (owns tables after step 1–3) | `Config/games/snake.js` |
| Reach (frozen) | `Libraries/Navigation/navReachHorizon.js` |

Ship log for old pass names: [`fsm/history.md`](fsm/history.md) — archive only, not the active queue.
