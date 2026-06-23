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

**Still wrong (why step 5 is next):** sprint is the worst remaining duplicate — two derive functions, spec wiring, **and** per-adapter callbacks; flee latch recomputes sprint through a third path. Not ready for flow or new modes until sprint is one derive + config.

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

### 5 — One sprint path ← **NEXT**

**Problem:** “Should this agent sprint?” is answered in three places today:

| Path | Where | What |
|------|--------|------|
| A | `buildAgentDecisionContext` | `spec.deriveSprint(mode, …)` after pick |
| B | `createSnakeForageIntent` / `createFleeExploreIntent` | `deriveSprintIntent` callback into ground-nav adapter |
| C | `applyFleePolicyLatch` | Re-derives sprint when hysteresis overrides mode |

Snake uses `deriveSnakeSprintIntent(mode, threatState)`. Flee uses `deriveFleeSprintIntent(mode, threatState, hungerTier, foodFraction)`. Same question, two functions, adapter-specific signatures. Change one rule → grep three files.

**Target:** One function, one config table per species, zero adapter sprint params. Latch and initial pick both call the same derive with `(mode, ctx, sprintConfig)`.

#### Config shape (`Config/games/snake.js`)

Keep shared thresholds on existing `sprint` / `fleeAgent.sprint`. Add a **rules list** per species (closed rule ids — not a DSL):

```javascript
// snake root — add to existing sprint block or decision.sprint
sprint: {
  fleeSeverity: 0.5,
  rules: [
    { mode: "flee", rule: "severeOrLethalThreat", want: true, reason: "escape" },
    { mode: "seek_food", rule: "severeNonLethalThreat", want: true, reason: "feed" },
    { mode: "seek_prey", rule: "always", want: true, reason: "chase" },
  ],
},

// fleeAgent.sprint — same pattern, different rules
sprint: {
  fleeSeverity: 0.5,
  minHungerFraction: 0.1,
  rules: [
    { mode: "flee", rule: "severeOrLethalThreat", guards: ["minHunger"], want: true, reason: "escape" },
    { mode: "seek_food", rule: "severeNonLethalThreat", guards: ["minHunger", "bandDesperate"], want: true, reason: "race" },
    { mode: "seek_enemy", rule: "always", want: true, reason: "attack" },
  ],
},
```

**Closed rule ids** (engine implements, config picks): `always`, `severeOrLethalThreat`, `severeNonLethalThreat`. **Closed guards:** `minHunger`, `bandDesperate`, `bandNotSatisfied` (reuse band ids from `hungerBands`). New behavior = new named rule in engine, not inline config logic.

#### Engine work

1. Add `deriveSprintIntent(mode, ctx, sprintConfig)` in `Libraries/AI/agents/` (e.g. `deriveSprintIntent.js`).
   - Reads `ctx.threatState`, `ctx.hungerTier`, `ctx.foodFraction` only — no extra args.
   - Walks `sprintConfig.rules` for matching `mode`; first matching rule wins; default `{ want: false, reason: "none" }`.

2. Wire **once** in `buildAgentDecisionContext`:
   - Spec exposes `sprintConfig: () => getSnakeGameConfig().sprint` (or flee equivalent).
   - After pick **and** whenever latch changes mode, call the same derive.

3. **Delete** from `gameDecisionContext.js`: `deriveSnakeSprintIntent`, `deriveFleeSprintIntent`, and `deriveSprint` on both specs.

4. **Remove adapter overrides:**
   - Drop `deriveSprintIntent` param from `createGroundNavIntentAdapter` (or make it internal-only).
   - `createSnakeForageIntent` / `createFleeExploreIntent` stop passing sprint callbacks.

5. **Fix flee latch:** `applyFleePolicyLatch` calls `deriveSprintIntent(policy.mode, ctx, sprintConfig)` — same import as decision build, not an injected callback.

6. **Tests:** Move sprint unit tests to import `deriveSprintIntent` + config; delete tests that only exercised deleted species functions. Keep parity cases (escape, feed, chase, flee race, min hunger block).

#### Done when

```bash
rg 'deriveSnakeSprintIntent|deriveFleeSprintIntent|deriveSprintIntent:' Libraries --glob '*.js'   # zero
rg 'deriveSprint:' Libraries/Game --glob '*.js'   # zero adapter sprint callbacks
```

- One `deriveSprintIntent` in engine; snake + flee differ only in `sprint.rules` in config.
- `ctx.sprintIntent` set only via that function (pick + latch).
- Decision tests + flee metabolism sprint tests green.

#### Files touched

| File | Change |
|------|--------|
| `Config/games/snake.js` | `sprint.rules` snake + flee |
| `Libraries/AI/agents/deriveSprintIntent.js` | new — single derive |
| `Libraries/AI/agents/buildAgentDecisionContext.js` | call derive; spec `sprintConfig` |
| `Libraries/AI/agents/gameDecisionContext.js` | remove sprint functions + spec hooks |
| `Libraries/Game/snake/createGroundNavIntentAdapter.js` | latch uses shared derive; drop param |
| `createSnakeForageIntent.js` / `createFleeExploreIntent.js` | remove sprint callback |
| `tests/snakeDecisionModel.test.js`, `tests/fleeAgentDecision.test.js`, `tests/fleeAgentMetabolism.test.js` | import engine derive |

---

### 6 — Flow locomotion (after 5)

**Problem:** Flee still steers with cell-pick heuristics; crowds and smooth escape want local flow.

**Do:** Replace flee **steering** (not decision reach) with backward flow sampling at agent cell. Decision scoring **stays** on `navReachHorizon` — never per-agent flow windows on the utility hot path.

**Done when:** flee escape/regroup uses flow downhill; reach for scoring unchanged.

**Gate:** Step 5 merged — don’t add flow while sprint is still triple-wired.

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
| Config | `Config/games/snake.js` |
| Reach (frozen) | `Libraries/Navigation/navReachHorizon.js` |

Ship log: [`fsm/history.md`](fsm/history.md) — archive only.
