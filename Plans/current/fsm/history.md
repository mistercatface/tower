# FSM reach — history

**Active plan:** [`fsmbfs.md`](fsmbfs.md) — hygiene law + Part 2 flow locomotion

**Sibling docs:** [`../normalization.md`](../normalization.md) · [`../stupid.md`](../stupid.md) · [`../passthrough.md`](../passthrough.md) · [`../objects.md`](../objects.md) · [`../frame.md`](../frame.md)

---

# Phase 1 — `reachSteps`

**Status:** complete ✅ (Passes 1–5)

**Goal (achieved):** Delete every exported distance field and replace with **one dialect**: **`reachSteps`** — octile nav path steps on `NavTopology`.

**Supersedes:** “wire `FlowFieldWindow.checkReachability` for utility scorers” in [`../../AI.md`](../../AI.md#future-local-flow-horizons). Decision reach = **`navReachHorizon.js`** only.

---

## What we deleted (passthrough + duplicate dialect)

```text
classifyAgentVision *Dist  ──copy──►  intentMemory enrich *Dist  ──copy──►  blackboard known.*Dist  ──read──►  reachForCandidate
targetMemory lastDistanceCells ───────────────────────────────────────────────────────────────────────────►  same chain
```

After: perception/memory hold **targets only**. Intent adapter runs `syncNavReachHorizon` once, fills `reachSteps` once, passes into `build*DecisionContext`. Scorers read `facts.reachSteps.*` only.

---

## The rule (frozen — do not regress)

```text
One distance for AI decisions: reachSteps (nav path steps).
Perception and memory store targets only — never distance.
syncNavReachHorizon once per agent per decision tick; navReachStepsTo for lookups.
```

| Need | Read from |
|------|-----------|
| Effort cost in `netScoreDetail` | `blackboard.facts.reachSteps.{prey\|food\|ally\|threat\|enemy}` |
| Committed route (may exceed horizon) | `routeStatus.pathLen` when committed target matches — inline in intent adapter |
| Threat severity / lethal flee | `reachSteps.threat` + inline cell math from config + `cellSize` |
| Cohesion / pack distance | `reachSteps.ally` |
| Debug score breakdown | `candidateScoreDetails.*.reach` |
| Vision cone | Internal `distSq` in `classifyAgentVision` only — **never exported** |

---

## Problem (before phase 1)

| Layer | Field | What it actually was |
|-------|-------|---------------------|
| `classifyAgentVision.js` | `threatDist` | **World pixels** |
| same | `preyDist`, `allyDist` | Euclidean ÷ `cellSize` |
| `agentWorldPerception.js` | `foodDist` | Euclidean ÷ `cellSize` |
| `reachForCandidate` ×2 | `known.*Dist` fallback | Straight-line cells |
| same | committed branch | HPA `pathLen` — real steps |
| `targetMemory.js` | `lastDistanceCells` | Stale euclidean at observe time |
| `fleeIntentMemory.js` | remembered `threatDist` | **Pixels vs cells unit bug** |

Also removed: `aggregateThreatSeverity`, `reachForCandidate`, duplicated distance helpers. Deleted `FlowFieldWindow.checkReachability`, `FlowFieldGrid.checkReachability`.

---

## Shipped API

**File:** `Libraries/Navigation/navReachHorizon.js`

```javascript
syncNavReachHorizon(navTopology, startX, startY, maxSteps) → boolean
navReachStepsTo(worldX, worldY) → number | null
```

- Module scratch: `Int32Array distances`, `Uint32Array visitedGen`, `Int32Array queue`; generation stamp.
- BFS on `topology.octileNeighbors` + `topology.blocked` — same walkability as HPA.
- `gridReachabilityBfs.js` unchanged (flow cold path).

### Module singleton contract

```text
For each agent that runs decision this tick:
  syncNavReachHorizon(nav, agent.x, agent.y, maxSteps)   // overwrites scratch
  navReachStepsTo(target.x, target.y)                    // read before next agent sync
```

**Never** hold a returned horizon object across agents. **Sync failure** → all lookups `null`; scorers treat null as unreachable. **No** euclidean `*Dist` fallback.

**Nav topology source:** `requireSnakeVisionFrame(state).navTopology` — read at sync site, no resolver.

### Config

| Key | Where |
|-----|-------|
| `decisionReachHorizon: 32` | `Config/games/snake.js` |
| `fleeRange`, `lethalThreatRange`, `visionRange.range` | pixels → inline `Math.ceil` in threat derive |

---

## Blackboard shape (shipped)

**Perception:** `{ threat, prey, ally, food, threatCount, allyCount, allyCentroid }` — no `*Dist`.

**Memory:** `{ kind, id, x, y, cell, ageTicks, ttlTicks, confidence }` — no `lastDistance*`.

**Blackboard:**

```javascript
facts.known = { threat, prey, food, ally, … };   // flee: enemy not prey
facts.reachSteps = { threat, prey, food, ally }; // flee: enemy not prey
facts.routeStatus = { pathLen, hasRoute, … };
```

One write site for `reachSteps` in intent adapter — not mirrored into `visible` / `remembered` / `known` dist sub-records.

**Threat derive (inline cell math, no resolver):**

```javascript
export function deriveSnakeThreatState(visibleThreat, reachSteps, cellSize, config = getSnakeGameConfig()) {
    if (!visibleThreat || reachSteps == null) return null;
    const fleeRangeCells = Math.ceil((config.fleeRange ?? config.visionRange.range) / cellSize);
    const lethalThreatRangeCells = Math.ceil(config.lethalThreatRange / cellSize);
    const severity = Math.max(0, Math.min(1, (fleeRangeCells - reachSteps) / fleeRangeCells));
    return { dist: reachSteps, severity, lethal: reachSteps <= lethalThreatRangeCells };
}
```

---

## Sight vs reach

| | Sight | Reach |
|---|-------|-------|
| Question | Who is in cone + LOS? | How many path steps to walk there? |
| Layer | `classifyAgentVision` internal `distSq` | `navReachHorizon` after sync |
| Exported? | **Targets only** | **`facts.reachSteps.*` only** |

**Visible threat, no path within horizon:** `reachSteps.threat === null` → no severity flee (intentional).

---

## Intent adapter tick pipeline (reference)

```javascript
const nav = requireSnakeVisionFrame(state).navTopology;
syncNavReachHorizon(nav, agent.x, agent.y, config.decisionReachHorizon ?? 32);

function reachStepsForMode(target, mode) {
    if (!target) return null;
    if (committed?.mode === mode && committed.targetId === target.id) {
        const pathLen = routeStatus?.pathLen;
        if (Number.isFinite(pathLen)) return pathLen;
    }
    return navReachStepsTo(target.x, target.y);
}

const reachSteps = {
    threat: reachStepsForMode(known.threat, "flee"),
    prey: reachStepsForMode(known.prey, "seek_prey"),       // snake
    enemy: reachStepsForMode(known.enemy, "seek_enemy"),   // flee
    food: reachStepsForMode(known.food, "seek_food"),
    ally: reachStepsForMode(known.ally, "seek_ally"),
};
```

Snake: `reachSteps.prey`. Flee: `reachSteps.enemy`. Locomotion unchanged: `cellTargetHpaNav`, `pickFleeCell`.

---

## Passes 1–5

### Pass 1 — Horizon primitive ✅

| Shipped | |
|---------|---|
| `Libraries/Navigation/navReachHorizon.js` | `syncNavReachHorizon`, `navReachStepsTo` |
| `Config/games/snake.js` | `decisionReachHorizon: 32` |
| `tests/navReachHorizon.test.js` | sync/lookup; edit staleness |

### Pass 2 — Skipped

`reachStepsForMode` inlined in intent adapters (Pass 4).

### Pass 3 — Strip perception + memory distances ✅

| File | Change |
|------|--------|
| `classifyAgentVision.js` | deleted exported `*Dist`, `aggregateThreatSeverity` |
| `agentWorldPerception.js` | deleted all `*Dist` |
| `fleeWorldPerception.js` | delegate to `perceiveAgentWorld` |
| `targetMemory.js` | deleted `lastDistance*` |
| `snakeIntentMemory.js`, `fleeIntentMemory.js` | no dist synthesis on enrich |

### Pass 4 — Wire reach into live decisions ✅

| File | Work |
|------|------|
| `createSnakeForageIntent.js`, `createFleeExploreIntent.js` | sync/lookup; `reachStepsForMode`; pass `reachSteps` |
| `snakeDecisionModel.js`, `fleeDecisionModel.js` | `facts.reachSteps.*`; delete `reachForCandidate`; `routeEvents` exported (partial dedupe) |

### Pass 5 — Grep gate + doc sync ✅

```bash
rg 'preyDist|foodDist|allyDist|threatDist|enemyDist|lastDistanceCells|reachForCandidate|aggregateThreatSeverity' --glob '*.js'
rg 'buildNavReachHorizon|resolveSnakeReachConfig|resolveReachSteps' --glob '*.js'
rg 'Libraries/AI/decision' --glob '*.js'
rg 'checkReachability' --glob '*.js'
```

All zero hits in `*.js`. Deleted flow `checkReachability`.

---

## Banned (phase 1 — still in force)

| Banned | Why |
|--------|-----|
| `buildNavReachHorizon()` → `{ stepsTo }` | Fake mini-service |
| `Libraries/AI/decision/*` package | Barrel sprawl |
| `resolveSnakeReachConfig()` / `resolve*Reach*` getters | Boot getter theater |
| Per-agent `FlowFieldWindow` for **scoring** | Wrong tool; async |
| Threading `reachSteps` through memory enrich | Passthrough |
| Reintroducing `*Dist` / `reachForCandidate` | Duplicate dialect |
| Mock `{ stepsTo: () => N }` in tests | Test real module |

---

## Phase 1 review bar ✅

- [x] One reach dialect everywhere in scoring/threat/cohesion
- [x] Perception + memory: targets only
- [x] Module scratch sync/lookup — no returned horizon objects
- [x] Reach once per agent at intent adapter
- [x] No `Libraries/AI/decision/` package or resolver getters
- [x] No `*Dist` grep hits in `Libraries/`
- [x] Net line count negative (phase 1 scope)
- [x] `checkReachability` deleted from flow types

---

# Part 1 — AI consumer cleanup

**Status:** Passes A–F complete ✅ · Pass G (grep + doc sync) open

**Why:** Phase 1 fixed reach dialect; snake and flee were still copy-paste forks (decision models, memory, perception, ~500-line twin intent adapters). Flee imported generic derives from `snakeDecisionModel.js`.

**Goal (achieved):** One shared module per duplicated concept; species files hold modes/scorers/blackboard shape only; flee imports `Libraries/AI/` not snake for generics.

---

## Part 1 — passes

| Pass | Work | Bar |
|------|------|-----|
| **A — Inventory** | Renamed misnamed `agentPopulationRegistry.js` → `agentRelationship.js` (dead — zero importers) | no behavior change |
| **B — Generic derives** | `deriveThreatState`, `deriveAllyState`, `targetEvents` → `Libraries/AI/`; deleted `deriveFleeAgentThreatState` | flee imports AI only |
| **C — Intent memory** | `createAgentIntentMemory.js`; deleted `snakeIntentMemory.js`, `fleeIntentMemory.js` | two call sites; snake `filterAllyForEngagement: true` |
| **D — Perception** | `agentIntentPerception.js`; deleted `snakeIntent.js`, `fleeWorldPerception.js` | one `perceiveAgentIntentWorld` |
| **E — Decision dedupe** | `intentPolicy.js`, `hungerEffort.js`, `scoreFleeIntent.js` | helpers out of both `*DecisionModel.js` |
| **F — Intent adapter** | `createGroundNavIntentAdapter.js` + reach/route/latch/effects helpers | species adapters ~100 lines each |
| **G — Gate** | grep + doc sync | commands in [`fsmbfs.md`](fsmbfs.md) |

### Pass D bugfix

`reachStepsForMode`: do not use committed `pathLen: 0` before a route exists. Trust path length only when `hasRoute && pathLen > 0`, or when `destReached`. Fixed regroup integration test (snake dropped `seek_ally` on second tick).

### Stay in game adapters (by design)

Mode sets (`seek_prey` vs `seek_enemy`), engagement publish (snake), `regroupSizeFactor`, flee pack options, species blackboard builders, `policyForScoredMode` mode tables.

---

## Part 1 — file ledger

### Deleted

| File | ~Lines |
|------|-------:|
| `snakeIntentMemory.js` | 61 |
| `fleeIntentMemory.js` | 53 |
| `snakeIntent.js` | 25 |
| `fleeWorldPerception.js` | 20 |
| `deriveFleeAgentThreatState` (wrapper) | — |

### Added (15 modules, ~435 lines)

| Module | Lines | Consumers |
|--------|------:|-----------|
| `AI/agents/deriveThreatState.js` | 7 | snake + flee decision |
| `AI/agents/deriveAllyState.js` | 17 | snake + flee decision |
| `AI/agentIntent/targetEvents.js` | 15 | snake + flee decision |
| `AI/memory/createAgentIntentMemory.js` | 66 | snake + flee intent |
| `AI/agentIntent/intentPolicy.js` | 9 | snake + flee decision |
| `AI/utility/hungerEffort.js` | 10 | snake + flee decision |
| `AI/agents/scoreFleeIntent.js` | 9 | snake + flee decision |
| `Game/snake/agentIntentPerception.js` | 22 | snake + flee intent |
| `Game/snake/agentReachSteps.js` | 18 | ground-nav adapter |
| `Game/snake/createGroundNavIntentAdapter.js` | 129 | snake + flee intent |
| `Game/snake/getGroundNavFsmSnapshot.js` | 32 | snake autosim/HUD only |
| `AI/agentIntent/readAgentRouteStatus.js` | 14 | **adapter only** |
| `AI/agentIntent/createBrainArrivalStamper.js` | 18 | **adapter only** |
| `AI/agentIntent/createFleeIntentLatch.js` | 34 | **adapter only** |
| `AI/agentIntent/createCellTargetIntentEffects.js` | 35 | **adapter only** |

### Shrunk (representative)

| File | Before | After | Δ |
|------|-------:|------:|--:|
| `createSnakeForageIntent.js` | 268 | 98 | −170 |
| `createFleeExploreIntent.js` | 235 | 103 | −132 |
| `snakeDecisionModel.js` | 288 | 230 | −58 |
| `fleeDecisionModel.js` | 221 | 194 | −27 |

**Rough net:** ~550 lines removed from duplicates/deletions, ~435 in new modules → **~−115 lines**, **+15 files**.

---

## Part 1 — verdict

| Hygiene rule | Result |
|--------------|--------|
| Net negative LOC | **Marginal yes** (~−115) — not the big win phase 1 was |
| No passthrough layers | **Yes** — no resolver getters, no `{ stepsTo }` objects, no dist on memory |
| One factory per concept | **Yes** for memory, perception, adapter shell |
| Both consumers same PR | **Yes** for B–F extracts |
| Delete > add files | **No** — **+15 files** is the main smell |
| No framework folder | **Yes** — no `Libraries/AI/decision/` |

**What went well:** Real duplication gone. Flee no longer imports snake for generics. Twin ~500-line intent adapters collapsed to ~100-line species wiring. Reach dialect untouched. Tests green (99+ in intent/decision suites).

**What violated the spirit of hygiene:** Pass F split four helpers that only `createGroundNavIntentAdapter.js` calls into separate files (`readAgentRouteStatus`, `createBrainArrivalStamper`, `createFleeIntentLatch`, `createCellTargetIntentEffects`). Same for `getGroundNavFsmSnapshot.js` (snake-only). Letter of the law (“concrete file, not barrel”) was followed; **file-count budget** was not.

**Could have been worse:** No `createDecisionFramework`, no config resolver chain, no second reach dialect, no fake services. The adapter factory is one real factory, not a passthrough stack.

---

## Consolidation backlog (optional)

Merge when touching these areas — do **not** do a standalone “cleanup PR” unless net file count drops:

1. **Into `createGroundNavIntentAdapter.js`:** `readAgentRouteStatus`, `createBrainArrivalStamper`, `createFleeIntentLatch`, `createCellTargetIntentEffects` (~100 lines total).
2. **Into `createGroundNavIntentAdapter.js` or snake forage file:** `getGroundNavFsmSnapshot.js` (snake-only).
3. **Into `targetEvents.js`:** `intentPolicy.js` (both policy helpers, ~18 lines).
4. **Into `utilityScoring.js` or one `hungerScoring.js`:** `hungerEffort.js` + `scoreFleeIntent.js` if flee/snake remain only consumers.

**Do not merge:** `deriveThreatState`, `deriveAllyState`, `createAgentIntentMemory`, `agentIntentPerception`, `agentReachSteps` — each has clear dual-consumer or game-layer boundary justification.

---

## Part 1 — grep gates (Pass G)

```bash
rg 'preyDist|foodDist|allyDist|threatDist|enemyDist|lastDistanceCells|reachForCandidate' --glob '*.js'
rg 'buildNavReachHorizon|resolveSnakeReachConfig|Libraries/AI/decision/' --glob '*.js'
rg "from.*snakeDecisionModel" Libraries/Game/snake/fleeAgent --glob '*.js'
rg "^function pushTargetEvents|^function policyReasonForTarget|^function intentPolicy" Libraries/Game/snake --glob '*DecisionModel.js'
```

---

## Part 1 review bar

- [x] Flee does not import `snakeDecisionModel.js`
- [x] One intent memory factory
- [x] One perception entry (`agentIntentPerception.js`)
- [x] Decision policy/hunger/flee helpers shared
- [x] Intent adapter shell; species files ~100 lines
- [ ] Pass G grep run recorded
- [ ] Optional consolidation backlog if file count matters

