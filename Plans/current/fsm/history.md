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

**Status:** Passes A–G complete ✅

**Why:** Phase 1 fixed reach dialect; snake and flee were still copy-paste forks (decision models, memory, perception, ~500-line twin intent adapters). Flee imported generic derives from `snakeDecisionModel.js`.

**Goal (achieved):** One shared module per duplicated concept; species files hold modes/scorers/blackboard shape only; flee imports `Libraries/AI/` not snake for generics.

---

## Part 1 — passes

| Pass | Work | Bar |
|------|------|-----|
| **A — Inventory** | Misnamed `agentRelationship.js` orphan (never wired; real registry is `AI/agents/agentPopulationRegistry.js`) | deleted Pass G |
| **B — Generic derives** | `deriveThreatState`, `deriveAllyState`, `targetEvents` → `Libraries/AI/`; deleted `deriveFleeAgentThreatState` | flee imports AI only |
| **C — Intent memory** | `createAgentIntentMemory.js`; deleted `snakeIntentMemory.js`, `fleeIntentMemory.js` | two call sites; snake `filterAllyForEngagement: true` |
| **D — Perception** | `agentIntentPerception.js`; deleted `snakeIntent.js`, `fleeWorldPerception.js` | one `perceiveAgentIntentWorld` |
| **E — Decision dedupe** | `intentPolicy.js`, `hungerEffort.js`, `scoreFleeIntent.js` | helpers out of both `*DecisionModel.js` |
| **F — Intent adapter** | `createGroundNavIntentAdapter.js` + reach/route/latch/effects helpers | species adapters ~100 lines each |
| **G — Gate** | grep + orphan cleanup + doc sync | all gates clean; 75 tests |

### Pass G — gate run (2026-06-23)

**Orphan cleanup:** deleted `agentRelationship.js` (Pass A misname; zero importers — live registry is `Libraries/AI/agents/agentPopulationRegistry.js`). Pass C/D deletions (`snakeIntentMemory`, `fleeIntentMemory`, `snakeIntent`, `fleeWorldPerception`) already off disk.

**Grep gates** (zero hits in `Libraries/` on disk):

```text
preyDist|foodDist|allyDist|threatDist|enemyDist|lastDistanceCells|reachForCandidate|aggregateThreatSeverity
buildNavReachHorizon|resolveSnakeReachConfig|resolveReachSteps|checkReachability
Libraries/AI/decision
from.*snakeDecisionModel in fleeAgent/
duplicate pushTargetEvents|policyReasonForTarget|intentPolicy in *DecisionModel.js
```

**Tests:** 75 pass — `snakeForageIntent`, `snakeDecisionModel`, `snakeIntent`, `fleeAgentDecision`, `agentAllyPerception`.

**Next (plan only):** Pass H unified decision engine — see [`fsmbfs.md` § Part 1.5](fsmbfs.md#part-15--pass-h--unified-decision-engine-plan-only).

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
| `agentRelationship.js` | 8 (Pass G — orphan) |

### Added (7 modules — after consolidation merge)

| Module | Consumers |
|--------|-----------|
| `AI/agents/deriveThreatState.js` | snake + flee decision |
| `AI/agents/deriveAllyState.js` | snake + flee decision |
| `AI/agentIntent/targetEvents.js` | snake + flee decision (+ policy helpers) |
| `AI/memory/createAgentIntentMemory.js` | snake + flee intent |
| `Game/snake/agentIntentPerception.js` | snake + flee intent |
| `Game/snake/agentReachSteps.js` | ground-nav adapter |
| `Game/snake/createGroundNavIntentAdapter.js` | snake + flee intent (+ inlined route/latch/effects/fsm) |

Also extended (not new files): `utilityScoring.js` — hunger effort + flee risk scorer.

### Shrunk (representative)

| File | Before | After | Δ |
|------|-------:|------:|--:|
| `createSnakeForageIntent.js` | 268 | ~98 | −170 |
| `createFleeExploreIntent.js` | 235 | ~103 | −132 |
| `snakeDecisionModel.js` | 288 | ~230 | −58 |
| `fleeDecisionModel.js` | 221 | ~194 | −27 |

**Rough net:** ~550 lines removed from duplicates/deletions; **+7 new modules** (was +15 before merge); line count still ~−115 vs pre–Part 1.

---

## Part 1 — verdict

| Hygiene rule | Result |
|--------------|--------|
| Net negative LOC | **Marginal yes** (~−115) — not the big win phase 1 was |
| No passthrough layers | **Yes** — no resolver getters, no `{ stepsTo }` objects, no dist on memory |
| One factory per concept | **Yes** for memory, perception, adapter shell |
| Both consumers same PR | **Yes** for B–F extracts |
| Delete > add files | **Fixed post-merge** — +7 modules (was +15); 8 micro-files inlined |
| No framework folder | **Yes** — no `Libraries/AI/decision/` |

**What went well:** Real duplication gone. Flee no longer imports snake for generics. Twin ~500-line intent adapters collapsed to ~100-line species wiring. Reach dialect untouched. Tests green (99+ in intent/decision suites).

**What violated the spirit of hygiene (fixed):** Pass F initially split single-consumer helpers into separate files — merged back into `createGroundNavIntentAdapter.js`, `targetEvents.js`, and `utilityScoring.js`.

**Could have been worse:** No `createDecisionFramework`, no config resolver chain, no second reach dialect, no fake services. The adapter factory is one real factory, not a passthrough stack.

---

## Consolidation backlog ✅ (merged)

Reduced Part 1 file sprawl — **8 files deleted**, helpers folded into owners:

| Was | Now |
|-----|-----|
| `readAgentRouteStatus`, `createBrainArrivalStamper`, `createFleeIntentLatch`, `createCellTargetIntentEffects`, `getGroundNavFsmSnapshot` | private helpers + `getGroundNavFsmSnapshot` export in `createGroundNavIntentAdapter.js` |
| `intentPolicy.js` | `targetEvents.js` |
| `hungerEffort.js`, `scoreFleeIntent.js` | `utilityScoring.js` |

**Part 1 net modules after merge:** 7 added files — `deriveThreatState`, `deriveAllyState`, `targetEvents`, `createAgentIntentMemory`, `agentIntentPerception`, `agentReachSteps`, `createGroundNavIntentAdapter`.

**Pass H (+1 module):** `buildAgentDecisionContext.js` — both species import; species decision models hold spec + scorers only.

---

## Pass H — unified decision engine

**Status:** ✅ complete

**Engine:** `Libraries/AI/agents/buildAgentDecisionContext.js` — `createAgentDecisionBlackboard(spec, input)`, `pickAgentIntentPolicy`, `buildAgentDecisionContext(spec, input)`.

**Species specs:**

| | Snake | Flee |
|--|-------|------|
| **Hook** | `resolveKnownAlly` + engagement `afterPick` | prey→`enemy` alias in visible/remembered/known |
| **Scorers** | prey, food, seek_ally (leadworthy + size factor) | flee (+ outnumbered), enemy, food, seek_ally |
| **Lines** | 170 (was 227) | 150 (was 191) |

**Tests:** 91 pass — snake/flee decision, intent, engagement, ally memory/metabolism.

**Bar met:** no `Libraries/AI/decision/` · no scoring DSL · one engine file · both consumers same PR.

---

## Pass H2a — collapse decision frame

**Status:** ✅ complete (2026-06-23)

**Rule:** `Pass decisionContext. Read decisionContext. Nothing else.`

**Engine:** `buildAgentDecisionFrame(spec, input)` → flat frame (`known`, `remembered`, `reachSteps`, derived states, `events`). `buildAgentDecisionContext` returns one flat ctx with scores + `chosenIntent` — no `{ blackboard, decisionSnapshot }`.

**Adapter:** `createGroundNavIntentAdapter` sets `world = { decisionContext }`; `getDecisionContext()` replaces `getDecisionSnapshot()`; flee latch mutates `world.decisionContext` directly. Deleted `readThreatState`, `createSnakeDecisionBlackboard`, `createFleeDecisionBlackboard`.

**Tests:** 95 pass — migrated off `decisionSnapshot`, `blackboard.facts`, `createSnakeDecisionBlackboard`; frame-only tests use `buildSnakeDecisionFrame` / `buildFleeDecisionFrame`.

**Grep (Libraries + tests):** zero `decisionSnapshot`, `blackboard.facts`, `createSnakeDecisionBlackboard`, `readThreatState`, `getDecisionSnapshot`.

**Next:** H2b slot schema in `Config/games/snake.js` — see [`fsmbfs.md` § Part 1.6](fsmbfs.md#part-16--pass-h2--decision-frame-viewport-analog).

---

## Part 1 — grep gates (Pass G) ✅

Recorded 2026-06-23 — see [Pass G gate run](#pass-g--gate-run-2026-06-23) above.

```bash
rg 'preyDist|foodDist|allyDist|threatDist|enemyDist|lastDistanceCells|reachForCandidate' --glob '*.js'
rg 'buildNavReachHorizon|resolveSnakeReachConfig|Libraries/AI/decision/' --glob '*.js'
rg "from.*snakeDecisionModel" Libraries/Game/snake/fleeAgent --glob '*.js'
rg "^function pushTargetEvents|^function policyReasonForTarget|^function intentPolicy" Libraries/Game/snake --glob '*DecisionModel.js'
```

All clean on disk in `Libraries/`.

---

## Part 1 review bar

- [x] Flee does not import `snakeDecisionModel.js`
- [x] One intent memory factory
- [x] One perception entry (`agentIntentPerception.js`)
- [x] Decision policy/hunger/flee helpers shared
- [x] Intent adapter shell; species files ~100 lines
- [x] Pass G grep run recorded (2026-06-23)
- [x] Consolidation backlog merged (8 micro-files)

