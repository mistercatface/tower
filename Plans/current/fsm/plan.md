Stop building a nav graph view inside LOS (gridCellVision.js → hasGridCellLineOfSight)
Today: createNavGraphViewFromTopology(navTopology) allocates a fresh { grid, canStep, isBlocked, … } object every LOS check, even when cached on the boolean.
Fix: call navCanStep / topology fields directly in the Bresenham loop — no wrapper object.
Kills: one object + closures per vision ray.

tickKineticSleep new Set() (kineticPhysicsPass.js:16)
Today: brand-new Set every physics tick for island sleep walks.
Fix: module Uint8Array visited stamped by tick gen (same pattern as wall buckets).
Kills: one Set per tick, guaranteed.

netScoreDetail return object (utilityScoring.js:4)
Today: { value, reach, cost, net } × 4–5 modes per scoreSnakeIntentCandidateDetails call.
Fix: netScoreDetailInto(scratch, …) or score straight to Float32Array[5] on the decision context — pick only needs net.
Kills: ~5 objects per snake per tick (× flee model too).

## fsm

What else belongs in **`Libraries/AI/agents/`** (same layer as `EMPTY_AGENT_REACH_STEPS`) — read-only, ranked by duplication + payoff:

---

### Tier 1 — Same logic copy-pasted in snake + flee specs

**1. `deriveAgentHungerState(foodFraction, { satisfiedAtOrAbove, desperateBelow })`**
Snake and flee `derive*HungerState` are the same 6 lines; only config path differs. Hoist to `deriveAgentHungerState.js`; species pass config slice from `getSnakeGameConfig()` / `fleeAgent.hunger`.

**2. `buildAgentRemembered(memoryWorld, memorySource, slots)`**
Both `buildRemembered` blocks are the same `memorySource?.X ? memoryWorld?.X : null` loop over `{ threat, prey/enemy, food, ally }`. Spec declares slot names; agent builds the object once.

**3. `buildAgentEventTargets(visibleWorld, remembered, slots)`**
Both specs return the same `{ kind, visibleTarget, rememberedTarget }[]` with different slot names. One helper; spec passes `[["threat","threat"], ["prey","prey"], …]`.

**4. `policySlot` is redundant with `targetLost`**
In both specs they're identical maps (`seek_food → food`, etc.). `pickAgentIntentPolicy` can read `spec.targetLost[mode]` directly — drop half the spec surface.

---

### Tier 2 — Scoring / allocation (agent utility layer)

**5. `SCORE_ABSENT` + `exploreScoreDetail(weights)`**
Both models return `{ net: -Infinity }` ~10× per score pass and identical `explore: { value, reach: null, cost: 0, net: weights.explore }`. Hoist frozen sentinel + one explore template in `utilityScoring.js` (like reach steps).

**6. `netScoreDetailInto(scratch, value, reach, costPerUnit)` or flat score buffer**
Every food/prey/ally/enemy score allocates `{ value, reach, cost, net }`. Agent tick could write into module scratch or a `Float32Array[scoreOrder.length]` and only expose `net` to `pickBestScoreKey`.

**7. Shared `scoreFoodDetail` / `scoreSeekAllyDetail` with config hooks**
Food scoring is nearly identical (flee adds “satisfied → absent” + sprint penalty). Ally scoring is the same shape (threat blocks, cohesion bonus, idealStopDist). One agent helper + species config for thresholds/bonuses — biggest line-count win in the decision models.

---

### Tier 3 — Frame builders / visible→known pipeline

**8. Standard `buildAgentKnown(visible, remembered, visibleWorld, { preyKey, allyResolver? })`**
Default merge is always `visibleWorld.X ?? remembered.X` for threat/food; prey/enemy/ally differ slightly (snake has `resolveKnownAlly` + engagement). Hoist the common merge; snake keeps a thin `allyResolver` hook.

**9. Standard `buildAgentVisible(visibleWorld, memorySource, options)`**
Flee gates prey/ally on `memorySource`; snake copies straight from `visibleWorld`. One function with `{ gatePreyOnMemory, gateAllyOnMemory }` kills both `buildVisible` lambdas.

**10. Drop `buildSnakeDecisionFrame` from the public surface**
It re-derives hunger/threat then calls `buildAgentDecisionFrame` — that's already what `buildAgentDecisionContext` does. Tests should use `buildSnakeDecisionContext` or call the agent frame builder with a test input bag. Not a hoist, but removes spec-level indirection.

---

### Tier 4 — Smaller constants / defaults in agent

**11. `DEFAULT_AGENT_CELL_SIZE = 16`**
Used in `deriveThreatState(..., input.cellSize ?? 16, ...)`. One named constant in agent layer.

**12. Shared sprint intent skeleton**
Both `deriveSprintIntent` / `deriveFleeSprintIntent` share “flee + severe threat → sprint escape”, “seek_food + threat + desperate → sprint”. A `deriveAgentSprintIntent(mode, threatState, hungerState, sprintConfig)` with species config for mode names and thresholds.

**13. `scoreCandidateSet` output objects**
`candidateScores = {}` fresh object every tick. Could reuse frozen-empty + mutate known keys, or parallel arrays indexed by `scoreOrder`.

---

### What should **not** move to agent

- Snake-only: `resolveKnownAlly`, `deriveSnakeEngagementState`, prey faction logic, segment-count regroup — stay in `snakeDecisionModel.js`
- Flee-only: `scoreFlee` outnumbered multiplier, `seek_enemy` naming — stay in flee adapter
- `getSnakeGameConfig()` reads — stay at use site per your hygiene rules; agent helpers take **config slices**, not resolvers

---

### If you only do three more hoists

1. **`deriveAgentHungerState`** — trivial, zero behavioral risk
2. **`buildAgentRemembered` + `buildAgentEventTargets`** — kills the most spec boilerplate
3. **`SCORE_ABSENT` + shared explore detail** — kills the most per-tick `{ net: … }` garbage in scoring

That's the agent layer becoming the **memory/scoring dialect**, the way `EMPTY_AGENT_REACH_STEPS` is now the **reach dialect**. Species files keep weights, thresholds, and snake-only ally engagement — not another copy of “remembered food if memorySource.food”.
