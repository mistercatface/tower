# FSM reach — one nav BFS dialect (`reachSteps`)

**Goal:** Delete every exported distance field (`preyDist`, `foodDist`, `allyDist`, `threatDist`, `enemyDist`, `lastDistanceCells`) and replace them with **one number**: **`reachSteps`** — octile nav path steps on `NavTopology`, same unit for utility cost, threat severity, cohesion gates, pack distance, debug, and memory fallbacks.

**Sibling docs:** nav+AI bridge → [`../AI.md`](../AI.md#future-local-flow-horizons) · pathfinding tier 3 → [`../pathfinding.md`](../pathfinding.md) · normalization index → [`normalization.md`](normalization.md) · snake adapters → [`../games/snake.md`](../games/snake.md)

**Prerequisites (done):** frame draw pass · G1 forcefields · HPA locomotion for snake/flee · `NavTopology.canStep` worker sync · `FlowFieldWindow` / `computeFlowField` exist for sandbox (not used in this pass)

**Explicitly not this pass:** per-agent flow windows · flow worker for decisions · flee locomotion via vector fields · hybrid HPA+flow execution · multi-source blended fields

---

## The rule

```text
One distance for AI decisions: reachSteps (nav path steps).
Perception and memory store targets only — never distance.
Horizon BFS resolves reach once per agent per tick.
```

| Need | Read from |
|------|-----------|
| Effort cost input to `netScoreDetail` | `blackboard.facts.reachSteps.{prey\|food\|ally\|threat\|enemy}` |
| Committed route (accurate, may exceed horizon) | `routeStatus.pathLen` via `resolveReachSteps` |
| Threat severity / lethal flee | `reachSteps.threat` + cell-based config |
| Cohesion `idealStopDist` / pack `maxPackDistCells` | `reachSteps.ally` (already cells today) |
| Debug / HUD score breakdown | `decisionSnapshot.candidateScoreDetails.*.reach` (already on `netScoreDetail`) |
| “Is it in vision cone?” | Internal `distSq` in `classifyAgentVision` only — **never exported** |

**No second dialect.** No euclidean cells on the blackboard. No pixel `threatDist`. No memory `lastDistanceCells`. No `reachForCandidate` reading `known.*Dist`.

---

## Problem today (why this is confusing)

Utility scoring claims **cost per cell** but often feeds **straight-line cells**:

| Layer | Field | What it actually is |
|-------|-------|---------------------|
| `classifyAgentVision.js` L78–80 | `threatDist` | **World pixels** (euclidean) |
| same | `preyDist`, `allyDist` | Euclidean ÷ `cellSize` |
| `agentWorldPerception.js` L23 | `foodDist` | Euclidean ÷ `cellSize` |
| `reachForCandidate` (both decision models L63–71 / L159–168) | fallback `known.*Dist` | Same straight-line cells |
| same | committed branch | HPA `pathLen` — **real path steps** |
| `targetMemory.js` L10–11 | `lastDistance`, `lastDistanceCells` | Euclidean at observe time — stale second model |
| `fleeIntentMemory.js` L35 | remembered `threatDist` | **Mixes pixels (visible) with cells (memory)** — unit bug |

`FlowFieldWindow.checkReachability` / `FlowFieldGrid.checkReachability` exist but have **zero production callers**. `computeFlowField` computes `bfsDistances` then throws them away after writing vectors.

Duplicated decision helpers (exact copies in snake + flee):

- `reachForCandidate`
- `committedTargetMatches`
- `routeEvents`
- `pushTargetEvents`
- `costPerCellForHunger` (near-identical)

`aggregateThreatSeverity` is computed in pixels in `classifyAgentVision` and threaded through flee blackboards but **never used in scoring** — flee uses `threatState.severity` from `deriveSnakeThreatState(threatDist)` instead.

---

## Target architecture

### One BFS per agent per tick (not per target)

Forward octile BFS from agent position, capped at **`decisionReachHorizon`**. Lookup table answers “steps to `(target.x, target.y)`?” for every candidate in one pass.

Do **not** add per-agent `FlowFieldWindow` pools or flow worker messages for phase 1. Use sync BFS on `NavTopology` — same walkability as HPA/flow, zero async desync.

### New modules (~120 lines total)

#### `Libraries/Navigation/navReachHorizon.js`

```javascript
/**
 * @param {import("./NavTopology.js").NavTopology} navTopology
 * @param {number} startX
 * @param {number} startY
 * @param {number} maxSteps
 * @returns {{ stepsTo(x: number, y: number): number | null, topologyKey: string }}
 */
export function buildNavReachHorizon(navTopology, startX, startY, maxSteps) { … }
```

- One forward BFS from agent cell using `navTopology.canStep(fromCol, fromRow, toCol, toRow)`.
- Reuse `bfsTypedIndices` from `Libraries/DataStructures/gridBfs.js`.
- Scratch: module-owned `Int32Array` distances keyed by flat nav index (resize when grid grows).
- `stepsTo(x, y)`: world → col/row via `navTopology.grid`, return distance or `null` if unreachable within `maxSteps`.
- `topologyKey`: from `navTopology` epoch / wall revision — invalidate scratch when topology changes.

#### `Libraries/Pathfinding/gridPathStepsBfs.js` (or extend `gridReachabilityBfs.js`)

Replace bool-only `gridReachabilityBfs` with:

```javascript
/**
 * @returns {number | null} path steps, or null if unreachable within maxSteps
 */
export function gridPathStepsBfs(grid, startIdx, targetIdx, isBlocked, maxSteps) { … }
```

Used by `navReachHorizon` and (later) flow-field distance queries. **Merge** bool reachability into this — delete separate unlimited BFS if redundant.

#### `Libraries/AI/decision/resolveReachSteps.js`

```javascript
/**
 * @param {ReturnType<typeof buildNavReachHorizon>} horizon
 * @param {{ x: number, y: number, id?: * } | null} target
 * @param {{ mode: string, committedTarget: object | null, routeStatus: object | null }} ctx
 * @returns {number | null}
 */
export function resolveReachSteps(horizon, target, { mode, committedTarget, routeStatus }) {
    if (!target) return null;
    if (committedTarget?.mode === mode && committedTarget.targetId === target.id) {
        const pathLen = routeStatus?.pathLen;
        if (Number.isFinite(pathLen)) return pathLen;
    }
    return horizon.stepsTo(target.x, target.y);
}
```

Shared helpers extracted here (or sibling `decisionBlackboardHelpers.js`):

- `committedTargetMatches`
- `routeEvents`
- `pushTargetEvents`

---

## Blackboard shape (after)

### Perception world — targets only

`classifyAgentVision` return (delete L78–80, L62, L82):

```javascript
{
    threat, prey, ally,
    threatCount, allyCount, allyCentroid,
}
```

Keep **internal** `distSq` / `best*DistSq` for vision range cull and nearest-target tie-break. Delete exported `threatSeverityForDist` aggregation — severity moves to decision layer.

`perceiveAgentWorld` / `perceiveFleeAgentWorld` return:

```javascript
{
    threat, prey, ally, food,
    threatCount, allyCount, allyCentroid,
}
```

Delete: `threatDist`, `preyDist`, `allyDist`, `foodDist`, `aggregateThreatSeverity`.

`fleeWorldPerception.js` — delete L27–28 food dist; delegate food through `perceiveAgentWorld` (same as `snakeIntent.js`).

### Memory — position only

`Libraries/AI/memory/targetMemory.js` — `makeRecord` stores:

```javascript
{ kind, id, x, y, cell, ageTicks, ttlTicks, confidence }
```

Delete: `lastDistance`, `lastDistanceCells` from `makeRecord`, `snapshotRecord`, tests.

Reach to remembered targets is always **fresh** each tick: `horizon.stepsTo(record.x, record.y)`. Wall appears → `null` without TTL hacks.

### Intent memory enrich — no dist synthesis

`snakeIntentMemory.js` L44–46 — delete `preyDist` / `foodDist` / `allyDist` passthrough.

`fleeIntentMemory.js` L35–38 — same; delete `aggregateThreatSeverity` passthrough L41–42.

Enrich returns merged **targets** + `memorySource` flags only.

### Blackboard facts

```javascript
facts.known = {
    threat, prey, food, ally,           // snake
    // flee: enemy instead of prey on known.enemy
    threatCount, allyCount, allyCentroid,
};
facts.reachSteps = {
    threat: number | null,
    prey: number | null,      // flee: enemy → reachSteps.enemy
    food: number | null,
    ally: number | null,
};
facts.routeStatus = { pathLen, hasRoute, … };  // unchanged
```

Delete from blackboard visible/remembered/known: all `*Dist` fields.

### Scoring — one read path

```javascript
// snakeDecisionModel.js — scoreFoodDetail
return netScoreDetail(value, blackboard.facts.reachSteps.food, costPerCellForHunger(pressure, hunger));

// scoreSeekAllyDetail — cohesion stop (delete allyDist fallback L224–230)
if (reachSteps.ally != null && reachSteps.ally <= cohesion.idealStopDist) return { net: -Infinity };
return netScoreDetail(value, reachSteps.ally, costPerCellForHunger(pressure, hunger));
```

Delete: `reachForCandidate`, `?? (Number.isFinite(allyDist) ? allyDist : null)`.

### Threat state — cells not pixels

`deriveSnakeThreatState(threat, reachSteps)` in `snakeDecisionModel.js` L13–18:

```javascript
export function deriveSnakeThreatState(visibleThreat, reachSteps) {
    if (!visibleThreat || reachSteps == null) return null;
    const { fleeRangeCells, lethalThreatRangeCells } = getSnakeGameConfig();
    const severity = Math.max(0, Math.min(1, (fleeRangeCells - reachSteps) / fleeRangeCells));
    return { dist: reachSteps, severity, lethal: reachSteps <= lethalThreatRangeCells };
}
```

`deriveAllyState` — `dist: reachSteps?.ally ?? null` (passed in from blackboard builder, not from `known.allyDist`).

---

## Config migration

Add to `Config/games/snake.js` (or derive in `snakeGameConfig.js` resolver — prefer resolver to avoid breaking raw defaults):

| New key | Derivation | Used for |
|---------|------------|----------|
| `decisionReachHorizon` | new, default **32** | BFS cap; matches HPA local threshold (~32 cells) |
| `fleeRangeCells` | `Math.ceil((fleeRange ?? visionRange.range) / cellSize)` | threat severity denominator |
| `lethalThreatRangeCells` | `Math.ceil(lethalThreatRange / cellSize)` | lethal flee gate (today 48px) |

Keep pixel keys (`fleeRange`, `lethalThreatRange`, `visionRange.range`) for **vision geometry** only — vision cone stays world-space.

Add resolver in `Libraries/Game/snake/snakeGameConfig.js`:

```javascript
export function resolveSnakeReachConfig(config = getSnakeGameConfig(), cellSize = …) {
    return {
        decisionReachHorizon: config.decisionReachHorizon ?? 32,
        fleeRangeCells: Math.ceil((config.fleeRange ?? config.visionRange.range) / cellSize),
        lethalThreatRangeCells: Math.ceil(config.lethalThreatRange / cellSize),
    };
}
```

Flee agent reads snake-global or nested overrides via same resolver pattern.

---

## Tick pipeline (intent adapters)

Both `createSnakeForageIntent.js` and `createFleeExploreIntent.js` — inside `perceiveWithMemory` **after** memory enrich, **before** `build*DecisionContext`:

```text
visibleWorld = perceive*(agent, state)           // targets only
intentMemory.update(agent, state, visibleWorld)
memoryWorld = intentMemory.enrichWorld(state, visibleWorld)

navTopology = state.navTopology  // or frame.navTopology from perception frame
horizon = buildNavReachHorizon(navTopology, agent.x, agent.y, reachConfig.decisionReachHorizon)

// Resolve known targets from visible + memory merge (same as today’s blackboard merge)
known = mergeKnownTargets(visibleWorld, memoryWorld, memorySource)

reachSteps = {
    threat: resolveReachSteps(horizon, known.threat, ctx),
    prey:   resolveReachSteps(horizon, known.prey,   ctx),   // flee: enemy
    food:   resolveReachSteps(horizon, known.food,   ctx),
    ally:   resolveReachSteps(horizon, known.ally,    ctx),
};

decisionContext = build*DecisionContext({
    visibleWorld, memoryWorld, memorySource,
    committedTarget, routeStatus: readRouteStatus(agent, state),
    reachSteps,
    …
});
```

`buildSnakeDecisionContext` / `buildFleeDecisionContext` accept `reachSteps` and pass into `create*DecisionBlackboard`. **`deriveSnakeThreatState` uses `reachSteps.threat`**, not `visibleWorld.threatDist`.

Locomotion unchanged: `createCellTargetHpaNav`, `pickFleeCell`, `resolveFleePackOptions` — phase 2.

---

## Forbidden after migration (grep gate = zero in `*.js`)

```text
preyDist
foodDist
allyDist
threatDist
enemyDist
lastDistanceCells
lastDistance          # as memory distance field
reachForCandidate
aggregateThreatSeverity
```

Also delete or redirect unused wrappers:

- `FlowFieldWindow.checkReachability` (`flowFieldWindow.js` L89–99)
- `FlowFieldGrid.checkReachability` (`FlowFieldGrid.js` L174–175)

---

## What stays euclidean (internal only — not a “model”)

| Location | Use | Why |
|----------|-----|-----|
| `classifyAgentVision.js` L39–42, L52–54 | `distSq` range cull + nearest pick | Vision geometry, not walk effort |
| `Config/games/snake.js` `visionRange.range` | FOV radius in world units | Sight cone, not nav reach |
| `snakeExplore.js`, `exploreSteering.js` | `cellChebyshevDistance` | Explore waypoint placement |
| `snakeFood.js` | nearest food spatial query | World query, not agent effort |
| `targetMemory.js` observe | still uses grid for `cell` | No distance stored |

---

## Pass 1 — Horizon primitive + BFS merge

**Goal:** Sync nav path-step query with tests. No decision model changes yet.

### Add

| File | Work |
|------|------|
| `Libraries/Navigation/navReachHorizon.js` | `buildNavReachHorizon`, module scratch buffers |
| `Libraries/Pathfinding/gridPathStepsBfs.js` | Range-limited forward BFS; optional merge from `gridReachabilityBfs.js` |

### Tests (new)

| File | Cases |
|------|-------|
| `tests/navReachHorizon.test.js` | Open grid: steps match octile expectation · wall blocks path: steps > euclidean would be · target beyond R → `null` · start blocked → `null` · topology revision invalidates |

Use small grid harness with `NavTopology.bakeInProcess()` — same pattern as existing nav tests.

### Config stub

| File | Work |
|------|------|
| `Config/games/snake.js` | Add `decisionReachHorizon: 32` |
| `Libraries/Game/snake/snakeGameConfig.js` | Add `resolveSnakeReachConfig()` |

### Review bar

- [ ] BFS uses `NavTopology.canStep` — not ad-hoc `gridFill`
- [ ] No allocations on hot path after first resize (module scratch)
- [ ] `gridPathStepsBfs` returns `number | null`, not bool

---

## Pass 2 — Shared decision reach helpers

**Goal:** Extract duplicated logic; test reach resolution in isolation.

### Add

| File | Work |
|------|------|
| `Libraries/AI/decision/resolveReachSteps.js` | `resolveReachSteps` + shared blackboard helpers |
| `tests/resolveReachSteps.test.js` | Mock horizon `{ stepsTo: () => N }` · committed + `pathLen` overrides horizon · unreachable → `null` |

### Change (minimal — imports only, keep old reach until Pass 4)

| File | Work |
|------|------|
| `snakeDecisionModel.js` | Import shared helpers where duplicated (optional prep) |
| `fleeDecisionModel.js` | Same |

### Review bar

- [ ] Single implementation of `committedTargetMatches`, `routeEvents`, `pushTargetEvents`
- [ ] Tests do not inject `preyDist` into world fixtures

---

## Pass 3 — Strip perception + memory distances

**Goal:** Delete exported distance fields at the source. Pure deletion pass.

### Change

| File | Lines / work |
|------|----------------|
| `Libraries/AI/perception/classifyAgentVision.js` | Remove L78–80 exports · remove `aggregateThreatSeverity` accumulation L31–32, L61–62, L82 · keep internal `distSq` |
| `Libraries/AI/perception/agentWorldPerception.js` | Remove L23, L29–32 `*Dist` fields |
| `Libraries/Game/snake/fleeAgent/fleeWorldPerception.js` | Delete L27–28 · delegate to `perceiveAgentWorld` |
| `Libraries/AI/memory/targetMemory.js` | Remove L10–11, L28–29 distance fields |
| `Libraries/Game/snake/snakeIntentMemory.js` | Remove L44–46 dist synthesis |
| `Libraries/Game/snake/fleeAgent/fleeIntentMemory.js` | Remove L35–38 dist · L41–42 aggregate severity |

### Tests to update

| File | Work |
|------|------|
| `tests/targetMemory.test.js` | Drop `lastDistance` / `lastDistanceCells` assertions |
| `tests/snakeIntent.test.js` | Remove L219–220 `preyDist` / `foodDist` asserts · assert targets only |
| `tests/agentAllyMemory.test.js` | Remove `allyDist` from fixtures |
| `tests/fleeAgentDecision.test.js` | Remove `*Dist` from mock worlds (temporary until Pass 4 wires horizon) |

### Review bar

- [ ] `rg 'preyDist|foodDist|allyDist|threatDist|lastDistanceCells'` → zero in `Libraries/` (tests may still fail until Pass 4)
- [ ] Perception return shape documented in this file matches code

---

## Pass 4 — Blackboard + scoring + intent wiring

**Goal:** Live game uses `reachSteps`. Delete all scoring dist paths.

### Change — intent adapters

| File | Work |
|------|------|
| `Libraries/Game/snake/createSnakeForageIntent.js` | Build horizon in `perceiveWithMemory` · pass `reachSteps` to `buildSnakeDecisionContext` |
| `Libraries/Game/snake/fleeAgent/createFleeExploreIntent.js` | Same for flee |

### Change — decision models

| File | Work |
|------|------|
| `Libraries/Game/snake/snakeDecisionModel.js` | `createSnakeDecisionBlackboard` takes `reachSteps` · delete all `*Dist` from visible/remembered/known · `deriveSnakeThreatState(reachSteps.threat)` · all `score*Detail` read `facts.reachSteps.*` · delete `reachForCandidate` · `deriveAllyState` uses `reachSteps.ally` · `buildSnakeDecisionContext` accepts `reachSteps` |
| `Libraries/Game/snake/fleeAgent/fleeDecisionModel.js` | Mirror · `reachSteps.enemy` for flee prey slot · delete `enemyDist` |

### Change — config

| File | Work |
|------|------|
| `Libraries/Game/snake/snakeGameConfig.js` | Wire `resolveSnakeReachConfig` into hot paths |

### Tests to rewrite

| File | Work |
|------|------|
| `tests/snakeDecisionModel.test.js` | Replace `world({ preyDist: 1 })` with mock horizon or grid harness · L77–80 reach/cost asserts use real steps · L141–214 threat tests use `reachSteps` / cell config not `threatDist: 64` · L264–304 ally tests use `reachSteps.ally` |
| `tests/fleeAgentDecision.test.js` | Full mock `reachSteps` on context builder |
| `tests/snakeEngagement.test.js` | Remove `foodDist: 2` from blackboard fixtures — pass `reachSteps` |

### Behavior changes (expected)

- Prey visible through wall → `reachSteps.prey === null` → hunt mode scores `-Infinity` unless desperate/committed pathLen
- Threat behind wall → no flee from threat severity (unless committed route says otherwise)
- Remembered food behind new wall → `null` reach without waiting for memory TTL

### Review bar

- [ ] `reachForCandidate` grep → zero
- [ ] No `?? allyDist` fallbacks in scorers
- [ ] `candidateScoreDetails.*.reach` reflects path steps in game

---

## Pass 5 — Cleanup, dead code, docs

**Goal:** Grep gate clean repo-wide; delete unused APIs.

### Delete / redirect

| File | Work |
|------|------|
| `Libraries/Pathfinding/flowFieldWindow.js` | Remove `checkReachability` L89–99 or thin-wrap `gridPathStepsBfs` |
| `Libraries/Pathfinding/FlowFieldGrid.js` | Remove L174–175 `checkReachability` |
| `Libraries/Pathfinding/gridReachabilityBfs.js` | Merge into `gridPathStepsBfs` if redundant |

### Docs

| File | Work |
|------|------|
| `Plans/AI.md` | Phase 4a ally line: `reachSteps` not `allyDist` · update “local flow horizons” phase 1 to “sync nav horizon BFS” |
| `Plans/current/normalization.md` | Link `fsmbfs.md` as Tier 2 / AI reach dialect |
| `Plans/NOW.md` | Optional queue entry |

### Final grep gate (all must be zero in `*.js`)

```bash
rg 'preyDist|foodDist|allyDist|threatDist|enemyDist|lastDistanceCells|reachForCandidate|aggregateThreatSeverity' --glob '*.js'
rg 'lastDistance' --glob '*.js'   # except unrelated physics/render uses if any — audit hits
```

### Review bar

- [ ] Net line count negative (~150–200 deleted, ~120 added)
- [ ] New agent species: pass `navTopology` + get correct reach — no new dist fields to invent
- [ ] `deriveSnakeThreatState` / cohesion / `netScoreDetail` all use same unit

---

## File checklist (every touch)

### New files

- `Libraries/Navigation/navReachHorizon.js`
- `Libraries/Pathfinding/gridPathStepsBfs.js`
- `Libraries/AI/decision/resolveReachSteps.js`
- `tests/navReachHorizon.test.js`
- `tests/resolveReachSteps.test.js`

### Modified — perception / memory

- `Libraries/AI/perception/classifyAgentVision.js`
- `Libraries/AI/perception/agentWorldPerception.js`
- `Libraries/Game/snake/fleeAgent/fleeWorldPerception.js`
- `Libraries/AI/memory/targetMemory.js`
- `Libraries/Game/snake/snakeIntentMemory.js`
- `Libraries/Game/snake/fleeAgent/fleeIntentMemory.js`

### Modified — decision / intent

- `Libraries/Game/snake/snakeDecisionModel.js`
- `Libraries/Game/snake/fleeAgent/fleeDecisionModel.js`
- `Libraries/Game/snake/createSnakeForageIntent.js`
- `Libraries/Game/snake/fleeAgent/createFleeExploreIntent.js`
- `Libraries/Game/snake/snakeGameConfig.js`
- `Config/games/snake.js`

### Modified — tests

- `tests/snakeDecisionModel.test.js`
- `tests/fleeAgentDecision.test.js`
- `tests/snakeIntent.test.js`
- `tests/agentAllyMemory.test.js`
- `tests/targetMemory.test.js`
- `tests/snakeEngagement.test.js`

### Deleted / trimmed APIs

- `reachForCandidate` (both decision models)
- `FlowFieldWindow.checkReachability`
- `FlowFieldGrid.checkReachability`
- `gridReachabilityBfs` (if fully merged)

### Unchanged this pass

- `Libraries/Sandbox/groundNav/cellTargetHpaNav.js`
- `Libraries/Pathfinding/FlowFieldGrid.js` (sandbox drag-nav)
- `Libraries/Sandbox/flowGroundNavBehavior.js`
- `Libraries/AI/steering/pickFleeCell.js`
- `Libraries/Game/snake/fleeAgent/resolveFleePackOptions.js`
- `Libraries/Game/snake/focusedAgent*Overlays.js` (no dist dependency today)
- `Libraries/Game/snake/snakeHud.js`

---

## Phase 2 preview (after FSM BFS lands)

| Phase | Work | Reuses from this pass |
|-------|------|------------------------|
| **2a** | Flee-ball locomotion via local backward flow | `gridPathStepsBfs`, horizon scratch sizing |
| **2b** | Hybrid snake: HPA waypoint + local flow execution | `resolveReachSteps` + flow worker |
| **3** | Blended fields (threat repulsion + ally attraction) | Replaces `pickFleeCell` heuristic |

Do not start phase 2 until grep gate on `reachSteps` is clean and decision tests run on grid harness.

---

## How to know you got it (review bar — full)

- [ ] One distance dialect: **`reachSteps`** (path steps) for all FSM utility, threat, cohesion
- [ ] Perception exports **targets + counts + centroid** only
- [ ] Memory stores **position only** — no distance at observe time
- [ ] One BFS per agent per decision tick — not one per target
- [ ] Committed route still uses **`pathLen`** when target matches
- [ ] Threat config in **cells** (`fleeRangeCells`, `lethalThreatRangeCells`)
- [ ] Vision range stays **world pixels** for FOV — separate concern, not exported as reach
- [ ] No per-agent `FlowFieldWindow` pool in phase 1
- [ ] Duplicate snake/flee decision helpers consolidated
- [ ] `aggregateThreatSeverity` deleted
- [ ] `fleeIntentMemory` unit bug gone (was pixel/cell mix)
- [ ] Grep gate zero on all banned symbols

---

## Net code change (expectation)

| Removed | Added |
|---------|-------|
| ~8 distance fields × 3 layers (perception, memory, blackboard) | 1 `reachSteps` object on blackboard |
| Duplicate `reachForCandidate` × 2 + fallbacks | 1 `resolveReachSteps` |
| Memory distance observe + re-export | Position-only memory |
| Pixel/cell threat confusion | Cell-only threat severity |
| Unused `checkReachability` × 2 | Shared `gridPathStepsBfs` |

**~150–200 lines deleted, ~120 added** — net negative, one mental model.

---

## Related docs

| Doc | Role |
|-----|------|
| [`normalization.md`](normalization.md) | Cross-cutting dialect wins |
| [`../AI.md`](../AI.md) | FSM + utility stack · local flow horizons phase 2+ |
| [`../pathfinding.md`](../pathfinding.md) | Flow field tier · BFS primitives |
| [`../games/snake.md`](../games/snake.md) | Species, intent modes, config |
| [`frame.md`](frame.md) | Render dialect (done) — same “pick one shape” playbook |
