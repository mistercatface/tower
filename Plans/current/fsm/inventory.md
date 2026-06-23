# Part 1 — Pass A inventory

**Date:** Pass A complete · no behavior changes · rename + symbol map only

**Canonical population registry:** `Libraries/AI/agents/agentPopulationRegistry.js` (alive/dead/inert by headId)

---

## Renames (Pass A)

| Was | Now | Notes |
|-----|-----|-------|
| `Libraries/Game/snake/agentPopulationRegistry.js` | `Libraries/Game/snake/agentRelationship.js` | Misnamed — only exported `getAgentRelationship`. **Zero importers** before rename; dead code. Perception uses `resolveAgentRelationship` from `snakeAgentSession.js` directly. Delete candidate if still unused after Pass D. |

---

## File sizes (duplication scale)

| File | Lines |
|------|------:|
| `createSnakeForageIntent.js` | 268 |
| `createFleeExploreIntent.js` | 235 |
| `snakeDecisionModel.js` | 288 |
| `fleeDecisionModel.js` | 221 |
| `snakeIntentMemory.js` | 61 |
| `fleeIntentMemory.js` | 53 |
| `snakeIntent.js` | 25 |
| `fleeWorldPerception.js` | 20 |

---

## Pass B — Generic derives (flee → snake imports today)

`fleeDecisionModel.js` imports from `../snakeDecisionModel.js`:

| Symbol | Snake export | Flee usage | Move target |
|--------|--------------|------------|-------------|
| `deriveSnakeThreatState` | `snakeDecisionModel.js:13` | via `deriveFleeAgentThreatState` wrapper `:4-5` | `Libraries/AI/agents/deriveThreatState.js` (rename neutral) |
| `deriveAllyState` | `snakeDecisionModel.js:20` | blackboard build `:116` | `Libraries/AI/agents/deriveAllyState.js` |
| `routeEvents` | `snakeDecisionModel.js:57` | blackboard build `:98` | `Libraries/AI/agentIntent/routeEvents.js` |

**Delete after move:** `deriveFleeAgentThreatState` (thin wrapper)

**Snake-only (stay in game layer for now):** `resolveKnownAlly` inside `deriveAllyState` path — uses engagement session; extract with ally derive in Pass B.

---

## Pass B — Duplicated decision helpers (both models)

| Symbol | Snake | Flee | Lines ~same | Move target |
|--------|-------|------|-------------|-------------|
| `pushTargetEvents` | `:49` | `:44` | yes | `Libraries/AI/agentIntent/pushTargetEvents.js` or merge with route events module |
| `policyReasonForTarget` | ~~`:147`~~ | ~~`:52`~~ | yes | `Libraries/AI/agentIntent/intentPolicy.js` ✅ |
| `intentPolicy` | ~~`:151`~~ | ~~`:56`~~ | yes | same ✅ |
| `policyForScoredMode` | `:226` | `:178` | mode list differs | shared core + species mode table |
| `hungerKey` | ~~`:133`~~ | ~~`:38`~~ | yes | `Libraries/AI/utility/hungerEffort.js` ✅ |
| `costPerCellForHunger` | ~~`:139`~~ | ~~`:41`~~ | yes | same ✅ |
| `foodHungerScoreValue` | derived | derived | yes | same ✅ |
| `scoreRiskAdjustedFlee` | ~~`:156`~~ | ~~`:121`~~ | similar | `Libraries/AI/agents/scoreFleeIntent.js` ✅; flee adds multi-threat branch |
| `scoreFlee` | wrapper | wrapper | — | inline flee outnumbered multiplier only |
| `scoreFoodDetail` | `:177` | `:133` | similar | uses `foodHungerScoreValue`; flee adds satisfied + sprint penalty |
| `scoreSeekAllyDetail` | `:192` | `:150` | similar | shared; snake has `regroupSizeFactor` |
| `scoreExplore` | `:210` | `:165` | yes | shared |

**Snake-only scorers:** `scorePreyDetail`, `regroupSizeFactor`, `preyValueForHunger`, `effortConfig`

**Flee-only scorers:** `scoreEnemyDetail`, `fleeWeights`, `fleePressure`

**Parallel hunger/threat/sprint (rename-only wrappers):**

| Snake | Flee | Same shape? |
|-------|------|-------------|
| `deriveSnakeHungerState` | `deriveFleeHungerState` | yes — config path differs |
| `deriveSprintIntent` | `deriveFleeSprintIntent` | flee adds hunger branch |

---

## Pass B — Generic derives ✅

**Shipped:**

| Module | Exports |
|--------|---------|
| `Libraries/AI/agents/deriveThreatState.js` | `deriveThreatState(threat, reachSteps, cellSize, config)` |
| `Libraries/AI/agents/deriveAllyState.js` | `deriveAllyState(...)` |
| `Libraries/AI/agentIntent/targetEvents.js` | `pushTargetEvents`, `routeEvents` |

**Deleted:** `deriveFleeAgentThreatState` · local copies in both decision models · flee import of `snakeDecisionModel.js`

**Tests:** `snakeDecisionModel.test.js` threat derive → `deriveThreatState` + explicit config; snake + flee decision suites pass.

---

## Pass C — Intent memory ✅

**Shipped:** `Libraries/AI/memory/createAgentIntentMemory.js`

| Option | Snake | Flee |
|--------|-------|------|
| `filterAllyForEngagement` | `true` | default `false` |

Live/dead check lives on `targetFromMemoryRecord(record, state)` — no wrapper. `threatCount` rides `...visibleWorld` spread — no `preserveThreatCount` flag.

**Deleted:** `snakeIntentMemory.js`, `fleeIntentMemory.js`

**Call sites:** `createSnakeForageIntent.js`, `createFleeExploreIntent.js`, `agentAllyMemory.test.js`

---

## Pass D — Perception (next) wrappers

| Symbol | Snake (`snakeIntent.js`) | Flee (`fleeWorldPerception.js`) |
|--------|--------------------------|----------------------------------|
| `resolve*AgentPerceptionOptions` | `:5-13` | `:5-13` | body differs only in param name `state` vs `gameState` in closure |
| perceive wrapper | `perceiveSnakeIntentWorld` `:15-18` | `perceiveFleeAgentWorld` `:15-18` | identical shape |
| extra | `findNearestVisibleThreat` `:20-23` | — | snake-only |

Both use `requireSnakeVisionFrame`, `getSnakeGameConfig`, `resolveAgentRelationship`.

**Move target:** `Libraries/Game/snake/resolveAgentPerceptionOptions.js` + optional single `perceiveAgentIntentWorld` (game layer — session-bound).

**Shared vision tick (species-neutral name deferred):** `snakePerception.js` — `requireSnakeVisionFrame`, `beginSnakePerceptionTick`, used by snake, flee, food, overlays.

---

## Pass D — Perception ✅

**Shipped:** `Libraries/Game/snake/agentIntentPerception.js` — `resolveAgentPerceptionOptions`, `perceiveAgentIntentWorld`, `findNearestVisibleThreat`

**Deleted:** `snakeIntent.js`, `fleeAgent/fleeWorldPerception.js`

**Bugfix (regroup integration test):** `reachStepsForMode` in both intent adapters — do not use `pathLen: 0` before a route exists; only trust committed path length when `hasRoute && pathLen > 0`, or when `destReached`.

---

## Pass E — Decision dedupe ✅

**Shipped:**

| Module | Exports |
|--------|---------|
| `Libraries/AI/agentIntent/intentPolicy.js` | `policyReasonForTarget`, `intentPolicy` |
| `Libraries/AI/utility/hungerEffort.js` | `hungerKey`, `costPerCellForHunger`, `foodHungerScoreValue` |
| `Libraries/AI/agents/scoreFleeIntent.js` | `scoreRiskAdjustedFlee` |

**Still species-local:** `policyForScoredMode`, `scorePreyDetail`, `scoreEnemyDetail`, `scoreSeekAllyDetail`, blackboard builders, hunger/sprint derive wrappers.

**Grep gate:** no `policyReasonForTarget` / `intentPolicy` / `hungerKey` / `costPerCellForHunger` in `*DecisionModel.js`.

---

## Pass E — Blackboard builders (reference)

| | Snake | Flee |
|--|-------|------|
| Builder | `createSnakeDecisionBlackboard` | `createFleeDecisionBlackboard` |
| Known keys | prey | enemy (from prey slot) |
| Engagement | `engagementState`, session | none |
| Events | `pushTargetEvents` ×4 kinds | ×4 (+ enemy alias) |

---

## Pass F — Intent adapter ✅

**Shipped:**

| Module | Exports |
|--------|---------|
| `Libraries/Game/snake/createGroundNavIntentAdapter.js` | shared perceive/sync/latch/FSM wiring factory |
| `Libraries/Game/snake/agentReachSteps.js` | `reachStepsForMode`, `buildAgentReachSteps` |
| `Libraries/Game/snake/getGroundNavFsmSnapshot.js` | snake HUD/autosim FSM snapshot |
| `Libraries/AI/agentIntent/readAgentRouteStatus.js` | locomotion route snapshot |
| `Libraries/AI/agentIntent/createBrainArrivalStamper.js` | spatial brain arrival on cell enter |
| `Libraries/AI/agentIntent/createFleeIntentLatch.js` | `createFleeIntentLatch`, `applyFleePolicyLatch` |
| `Libraries/AI/agentIntent/createCellTargetIntentEffects.js` | shared seek/explore/flee effects + context |

**Species files:** `createSnakeForageIntent.js` (~113 lines), `createFleeExploreIntent.js` (~110 lines) — modes, reach slot maps, decision context, flee destination, transition reasons only.

**Grep gate:** no inline `reachStepsForMode` / `readRouteStatus` / `stampArrivalOnCellEnter` in species adapters.

---

## Pass F — Intent adapter (reference)

Both `createSnakeForageIntent.js` and `createFleeExploreIntent.js`:

| Block | Snake lines | Flee lines | Identical? |
|-------|------------:|-----------:|------------|
| `stampArrivalOnCellEnter` | 51-57 | 51-57 | yes |
| `readRouteStatus` | 59-71 | 59-71 | yes |
| `reachStepsForMode` | 81-87 | 93-99 | yes (mode keys differ in caller) |
| sync + reachSteps fill | 77-94 | 89-106 | yes |
| `createModePolicyLatch` flee block | 33-45 | 33-45 | ~yes (flee reads snapshot fallback) |
| `createEffects` skeleton | 122-147 | 121-152 | seek/explore/clear same; flee `setFleeDestination` adds pack + explore fallback |
| `createAgentIntent` wiring | 157-202 | 158-206 | modes/transitionReason differ |

**Move targets:**

- `Libraries/Game/snake/agentReachSteps.js` — `reachStepsForMode` + reach object builder
- `Libraries/AI/agentIntent/readAgentRouteStatus.js` — locomotion route snapshot
- `Libraries/AI/agentIntent/stampBrainArrivalOnCellEnter.js` — or inline in shared adapter factory
- Shared adapter factory (Pass F) — species file wires modes, engagement, pack flee only

---

## Misplaced generic in snake folder (summary)

| Module | Consumers | Pass |
|--------|-----------|------|
| `deriveSnakeThreatState`, `deriveAllyState`, `routeEvents`, `pushTargetEvents` | snake + flee | B ✅ |
| `snakePerception.js` / `requireSnakeVisionFrame` | snake, flee, food, HUD | D (rename later) |
| Decision helpers listed above | snake + flee | B + E |

---

## Grep anchors (Pass B+ verification)

```bash
rg "from.*snakeDecisionModel" Libraries/Game/snake/fleeAgent --glob '*.js'
rg "^function pushTargetEvents|^function policyReasonForTarget|^function intentPolicy" Libraries/Game/snake --glob '*DecisionModel.js'
rg "getAgentRelationship" --glob '*.js'
# last: zero importers until wired or deleted
```
