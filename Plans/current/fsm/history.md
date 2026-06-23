# FSM reach — phase 1 history (`reachSteps`)

**Status:** complete ✅ (Passes 1–5)

**Active plan:** [`fsmbfs.md`](fsmbfs.md) · Part 1 dedupe + Part 2 flow locomotion

**Goal (achieved):** Delete every exported distance field (`preyDist`, `foodDist`, `allyDist`, `threatDist`, `enemyDist`, `lastDistanceCells`) and replace with **one dialect**: **`reachSteps`** — octile nav path steps on `NavTopology`, same unit for utility cost, threat severity, cohesion gates, pack distance, and debug.

**Sibling docs:** [`../normalization.md`](../normalization.md) · [`../stupid.md`](../stupid.md) · [`../passthrough.md`](../passthrough.md) · [`../objects.md`](../objects.md) · [`../frame.md`](../frame.md)

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
