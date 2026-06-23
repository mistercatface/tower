# FSM reach — one nav BFS dialect (`reachSteps`)

**Goal:** Delete every exported distance field (`preyDist`, `foodDist`, `allyDist`, `threatDist`, `enemyDist`, `lastDistanceCells`) and replace them with **one number**: **`reachSteps`** — octile nav path steps on `NavTopology`, same unit for utility cost, threat severity, cohesion gates, pack distance, and debug.

**Sibling docs:** [`normalization.md`](normalization.md) · [`stupid.md`](stupid.md) · [`passthrough.md`](passthrough.md) · [`objects.md`](objects.md) · [`frame.md`](frame.md) · [`../AI.md`](../AI.md#future-local-flow-horizons) · [`../pathfinding.md`](../pathfinding.md) · [`../games/snake.md`](../games/snake.md)

**Prerequisites (done):** frame draw pass · G1 forcefields · HPA locomotion · `NavTopology` worker sync · Pass 1 `navReachHorizon.js`

**Authoritative for phase 1 decision reach:** This doc **supersedes** “wire `FlowFieldWindow.checkReachability` for utility scorers” in [`../AI.md`](../AI.md#future-local-flow-horizons) and the “lowest-risk entry: decision-only reach via flow window” note in [`../pathfinding.md`](../pathfinding.md). Phase 1 = **`syncNavReachHorizon` + `navReachStepsTo`** (module scratch BFS). Flow windows stay **phase 2+ locomotion** only.

**Explicitly not this work:** per-agent `FlowFieldWindow` pools · flow worker for decisions · new `Libraries/AI/decision/` package · behavior-tree / generic slot pipeline · `resolveSnakeReachConfig()` and other config resolver getters

---

## Plans alignment — read before coding

This is a **normalization** pass (pick one dialect), not a feature layer cake. Same class of win as AABB/scalars, frame `viewport`, floor belt revision cache.

| Plan | How this work must comply |
|------|---------------------------|
| [`normalization.md`](normalization.md) | One reach dialect end-to-end; delete parallel distance fields; no second bump/spine for reach |
| [`stupid.md`](stupid.md) | No getter/resolver theater; no fake mini-services; no new folder unless unavoidable; read config at use site |
| [`passthrough.md`](passthrough.md) | Distance was **passthrough** — computed in perception, copied to memory, copied to blackboard (`visible`/`remembered`/`known` layers), read by scorers. Delete the copies; compute reach **once** at intent adapter — see passthrough **Tier 1b** |
| [`objects.md`](objects.md) | Module scratch + generation stamp (`visitedGen` / `visitGen`); **zero** per-tick `{ stepsTo() }`, opts bags, or `new TypedArray` in hot path |
| [`frame.md`](frame.md) | **`syncNavReachHorizon` = sync once · `navReachStepsTo` = read many** — same contract as draw pass, not a returned handle object |

### What we are deleting (it was passthrough + duplicate dialect)

```text
classifyAgentVision *Dist  ──copy──►  intentMemory enrich *Dist  ──copy──►  blackboard known.*Dist  ──read──►  reachForCandidate
targetMemory lastDistanceCells ───────────────────────────────────────────────────────────────────────────►  same chain
```

After: perception/memory hold **targets only**. Intent adapter runs `syncNavReachHorizon` once, fills `reachSteps` once, passes into `build*DecisionContext`. Scorers read `facts.reachSteps.*` only.

### Module singleton contract (critical)

`navReachHorizon.js` uses **module-level scratch** — like draw pass scratch, not per-agent state bags.

```text
For each agent that runs decision this tick:
  syncNavReachHorizon(nav, agent.x, agent.y, maxSteps)   // overwrites scratch
  navReachStepsTo(target.x, target.y)                    // read before next agent sync
```

**Never** hold a returned horizon object across agents. **Never** read `navReachStepsTo` without a fresh sync for that agent. Multi-snake/flee means N syncs per tick — that is correct; pooling agents into one BFS is phase 2 locomotion, not this work.

**Sync failure** (`syncNavReachHorizon` → `false`: topology not ready, start blocked, out of frame): all `navReachStepsTo` lookups return `null`; `deriveSnakeThreatState` returns `null`; hunt/seek scorers treat null reach as unreachable (`-Infinity` via `netScoreDetail`). Do not fall back to euclidean `*Dist`.

**Nav topology source** (both intent adapters): `requireSnakeVisionFrame(state).navTopology` — same object as `state.nav.topology` after vision frame sync. No resolver; read at sync site.

### Where code lives (anti-sprawl)

| OK | Not OK |
|----|--------|
| `Libraries/Navigation/navReachHorizon.js` — BFS scratch + sync/lookup | `Libraries/AI/decision/reachSteps.js` or any new AI subpackage |
| Local `reachStepsForMode(...)` **inside** `createSnakeForageIntent` / `createFleeExploreIntent` (6 lines, inline) | Shared “decision framework” module for two game adapters |
| `facts.reachSteps` on blackboard — 4 numbers filled once per tick | Copying reach into `visible` / `remembered` / `known` layers |
| `getSnakeGameConfig().decisionReachHorizon` at intent adapter | `resolveSnakeReachConfig()`, `resolveReachSteps(horizon, …)` wrappers |
| Inline cell math in `deriveSnakeThreatState` | Precomputed `fleeRangeCells` on config via boot resolver |

Extract `routeEvents` / `committedTargetMatches` from snake+flee **only in the same PR** that rewires both decision models (Pass 4) — not a standalone “framework” PR.

---

## The rule

```text
One distance for AI decisions: reachSteps (nav path steps).
Perception and memory store targets only — never distance.
syncNavReachHorizon once per agent per decision tick; navReachStepsTo for lookups.
```

| Need | Read from |
|------|-----------|
| Effort cost in `netScoreDetail` | `blackboard.facts.reachSteps.{prey\|food\|ally\|threat\|enemy}` |
| Committed route (may exceed horizon) | `routeStatus.pathLen` when committed target matches — inline in intent adapter, not a wrapper |
| Threat severity / lethal flee | `reachSteps.threat` + inline cell math from config + `cellSize` |
| Cohesion `idealStopDist` / pack distance | `reachSteps.ally` (already cells) |
| Debug score breakdown | `candidateScoreDetails.*.reach` (already on `netScoreDetail`) |
| “Is it in vision cone?” | Internal `distSq` in `classifyAgentVision` only — **never exported** |

**No second dialect.** No euclidean cells on blackboard. No pixel `threatDist`. No memory `lastDistanceCells`. No `reachForCandidate`.

---

## Problem today

Utility scoring claims **cost per cell** but often feeds **straight-line cells**:

| Layer | Field | What it actually is |
|-------|-------|---------------------|
| `classifyAgentVision.js` | `threatDist` | **World pixels** |
| same | `preyDist`, `allyDist` | Euclidean ÷ `cellSize` |
| `agentWorldPerception.js` | `foodDist` | Euclidean ÷ `cellSize` |
| `reachForCandidate` ×2 | `known.*Dist` fallback | Straight-line cells |
| same | committed branch | HPA `pathLen` — real steps |
| `targetMemory.js` | `lastDistanceCells` | Stale euclidean at observe time |
| `fleeIntentMemory.js` | remembered `threatDist` | **Pixels vs cells unit bug** |

**Why threat derive changes:** today `deriveSnakeThreatState(visibleThreat, threatDist)` mixes **pixel** `threatDist` with **cell** `preyDist`/`allyDist` on the same blackboard; `lethalThreatRange` is pixels but prey scoring uses cells. After Pass 4, threat uses **`reachSteps` in cells** with inline `Math.ceil` from pixel config — one dialect everywhere.

Also dead weight: `aggregateThreatSeverity` threaded but unused in scoring. Duplicated snake/flee helpers: `reachForCandidate`, `committedTargetMatches`, `routeEvents`, `pushTargetEvents`.

`FlowFieldWindow.checkReachability` / `FlowFieldGrid.checkReachability` — zero prod callers. Do not “fix” reach by wiring these; decision reach is `navReachHorizon.js`.

---

## Never ship (grep + smell test)

Consolidated from [`stupid.md`](stupid.md), [`passthrough.md`](passthrough.md), [`objects.md`](objects.md), and first-pass mistakes:

| Banned | Why |
|--------|-----|
| `buildNavReachHorizon()` → `{ stepsTo, topologyKey }` | Fake mini-service / closure every agent (`passthrough` Tier 0 kin) |
| `{ stepsTo: () => null }` fallback objects | Alloc on failure path |
| `gridPathStepsBfs({ … })` + per-call `new TypedArray` | `objects.md` hot-path smell |
| `resolveSnakeReachConfig()` / any `resolve*Reach*` getter | `stupid.md` boot getter theater |
| `Libraries/AI/decision/*` new package | Barrel + abstraction sprawl |
| Per-agent `FlowFieldWindow` for scoring | Wrong tool; async; window + worker complexity |
| Threading `reachSteps` through memory enrich | Passthrough — compute at intent adapter only |
| `*Dist` on `visibleWorld` / `memoryWorld` after Pass 3 | Duplicate dialect |
| Mock `{ stepsTo: () => N }` in tests | Test the real sync/lookup module |
| `gridCenterX(col, row)` — API is `gridCenterX(col)` | Use `grid.gridToWorld(col, row)` in tests |

### Explicitly not “normalization” — do not expand scope

| Idea | Why skip |
|------|----------|
| Generic perception→memory→blackboard slot pipeline | Deferred in `AI.md`; duplication not painful enough for two consumers |
| Behavior-tree layer over intent | Separate feature |
| Merge `gridReachabilityBfs` into nav reach | Cold flow path; keep separate |
| Flow-field locomotion for flee | Phase 2 after grep gate clean |
| Pre-bake `fleeRangeCells` into config at boot | Inline one `Math.ceil` in `deriveSnakeThreatState` |

---

## Target API (Pass 1 ✅)

**File:** `Libraries/Navigation/navReachHorizon.js` — only new runtime module for this work.

```javascript
syncNavReachHorizon(navTopology, startX, startY, maxSteps) → boolean
navReachStepsTo(worldX, worldY) → number | null
```

- Module scratch: `Int32Array distances`, `Uint32Array visitedGen`, `Int32Array queue`; generation stamp (resize when grid grows).
- BFS on `topology.octileNeighbors` + `topology.blocked` — same walkability as HPA.
- Staleness: `gridNavCacheKey(grid)` at edit boundaries if needed — do not return `topologyKey` from sync.
- `gridReachabilityBfs.js` unchanged for flow cold path.

---

## Sight vs reach (do not conflate)

| | Sight | Reach |
|---|-------|-------|
| Question | Who is in cone + LOS? | How many path steps to walk there? |
| Layer | `classifyAgentVision` internal `distSq` | `navReachHorizon` after sync |
| Exported? | **Targets only** | **`facts.reachSteps.*` only** |

Removing `*Dist` does **not** remove sight — `visibleWorld.prey` etc. stay.

**Visible threat, no path within horizon:** `reachSteps.threat === null` → `deriveSnakeThreatState` returns null → no severity flee. That is intentional (tactical read: seen across gap ≠ walkable threat). If design wants “visible = afraid”, use `reachSteps.threat ?? fleeRangeCells` for severity only — document in config comment, do not reintroduce `threatDist`.

---

## Blackboard shape (after Pass 4)

### Perception — targets only

```javascript
// classifyAgentVision / perceiveAgentWorld
{ threat, prey, ally, food, threatCount, allyCount, allyCentroid }
```

Delete: all `*Dist`, `aggregateThreatSeverity`. Fix `fleeWorldPerception.js` — delegate to `perceiveAgentWorld` ([`passthrough.md`](passthrough.md) duplicate path).

### Memory — position only

```javascript
// targetMemory makeRecord
{ kind, id, x, y, cell, ageTicks, ttlTicks, confidence }
```

Delete: `lastDistance`, `lastDistanceCells`. Intent memory enrich: merged targets + `memorySource` flags — **no dist synthesis**.

### Blackboard — reach filled once, not layered

```javascript
facts.known = { threat, prey, food, ally, threatCount, allyCount, allyCentroid };  // flee: enemy not prey
facts.reachSteps = { threat, prey, food, ally };   // snake
// flee facts.reachSteps = { threat, enemy, food, ally }
facts.routeStatus = { pathLen, hasRoute, … };
```

**Delete entire `visible` / `remembered` / `known` distance sub-records** from `createSnakeDecisionBlackboard` / flee equivalent — not just `facts.known.*Dist`. Those layers exist only to merge passthrough dist; targets + `reachSteps` replace them.

**Do not** mirror `reachSteps` into `visible` / `remembered` / `known` sub-records. One write site in intent adapter.

**`deriveAllyState`:** stop reading `known?.allyDist`; pass `reachSteps.ally` (or read `blackboard.facts.reachSteps.ally` inside builder after Pass 4).

### Scoring

```javascript
return netScoreDetail(value, blackboard.facts.reachSteps.food, costPerCellForHunger(...));
```

Delete: `reachForCandidate`, `?? allyDist` fallbacks.

### Threat state — inline cell math

```javascript
export function deriveSnakeThreatState(visibleThreat, reachSteps, cellSize, config = getSnakeGameConfig()) {
    if (!visibleThreat || reachSteps == null) return null;
    const fleeRangeCells = Math.ceil((config.fleeRange ?? config.visionRange.range) / cellSize);
    const lethalThreatRangeCells = Math.ceil(config.lethalThreatRange / cellSize);
    const severity = Math.max(0, Math.min(1, (fleeRangeCells - reachSteps) / fleeRangeCells));
    return { dist: reachSteps, severity, lethal: reachSteps <= lethalThreatRangeCells };
}
```

No resolver. No pixel keys in this function.

---

## Config

| Key | Where | Used |
|-----|-------|------|
| `decisionReachHorizon: 32` | `Config/games/snake.js` ✅ | BFS cap at intent adapter |
| `fleeRange`, `lethalThreatRange`, `visionRange.range` | existing pixels | Vision cone + inline cell conversion in threat derive |

**Do not add** `fleeRangeCells` to config object via boot resolver. Read `getSnakeGameConfig().decisionReachHorizon` directly.

---

## Tick pipeline (intent adapters only)

Both `createSnakeForageIntent.js` and `createFleeExploreIntent.js` — after memory enrich, before `build*DecisionContext`:

```javascript
const config = getSnakeGameConfig();
const nav = requireSnakeVisionFrame(state).navTopology;
syncNavReachHorizon(nav, agent.x, agent.y, config.decisionReachHorizon ?? 32);

const committed = intent ? { mode: intent.getMode(), targetId: intent.getTargetId() } : null;
const routeStatus = readRouteStatus(agent, state);

function reachStepsForMode(target, mode) {
    if (!target) return null;
    if (committed?.mode === mode && committed.targetId === target.id) {
        const pathLen = routeStatus?.pathLen;
        if (Number.isFinite(pathLen)) return pathLen;
    }
    return navReachStepsTo(target.x, target.y);
}

// merge known targets from visible + memory (same as today’s blackboard merge)
const reachSteps = {
    threat: reachStepsForMode(known.threat, "flee"),
    prey: reachStepsForMode(known.prey, "seek_prey"),       // snake only
    enemy: reachStepsForMode(known.enemy, "seek_enemy"),   // flee only
    food: reachStepsForMode(known.food, "seek_food"),
    ally: reachStepsForMode(known.ally, "seek_ally"),
};

buildSnakeDecisionContext({ …, reachSteps });
// buildFleeDecisionContext({ …, reachSteps }) — omit prey key or leave null
```

**Species keys:** snake blackboard uses `reachSteps.prey`; flee uses `reachSteps.enemy` (same slot as `known.enemy`, mode `seek_enemy`). Do not alias enemy→prey in flee scorers.

**Keep `reachStepsForMode` local to the intent file** — or copy the 6-line function into flee adapter; do not create a shared AI module.

Locomotion unchanged: `cellTargetHpaNav`, `pickFleeCell`, `resolveFleePackOptions`.

---

## Pass 1 — Horizon primitive ✅

| Shipped | |
|---------|---|
| `Libraries/Navigation/navReachHorizon.js` | `syncNavReachHorizon`, `navReachStepsTo`, module scratch |
| `Config/games/snake.js` | `decisionReachHorizon: 32` |
| `tests/navReachHorizon.test.js` | sync/lookup; `gridToWorld`; `gridNavCacheKey` for edit staleness |

Review: [x] no returned objects [x] no per-call alloc [x] `gridReachabilityBfs` untouched

---

## Pass 2 — Optional (skip if inlined in Pass 4)

Only if you want an isolated test before touching decision models: extract `reachStepsForMode` to a **single** shared file both intents import — prefer **`Libraries/Game/snake/reachStepsForMode.js`** (game layer, not `Libraries/AI/`). Default: **skip Pass 2**; inline in Pass 4.

---

## Pass 3 — Strip perception + memory distances (deletion pass) ✅

Pure passthrough removal — no new APIs.

| File | Delete / change |
|------|-----------------|
| `classifyAgentVision.js` | exported `*Dist`, `aggregateThreatSeverity` — keep internal `distSq` for FOV/nearest pick |
| `agentWorldPerception.js` | all `*Dist` fields including `foodDist` |
| `fleeWorldPerception.js` | duplicate `foodDist` path; delegate body to `perceiveAgentWorld` + `resolveFleeAgentPerceptionOptions` (mirror `snakeIntent.js`) |
| `targetMemory.js` | `lastDistance`, `lastDistanceCells` |
| `snakeIntentMemory.js`, `fleeIntentMemory.js` | dist synthesis on enrich (`preyDist`, `threatDist`, …) |

Grep gate: zero `*Dist` / `lastDistanceCells` in `Libraries/`.

**Tests to rewrite (targets only, no dist fixtures):** `snakeDecisionModel.test.js`, `fleeAgentDecision.test.js`, `snakeIntent.test.js`, `snakeEngagement.test.js`, `agentAllyMemory.test.js` — use grid harness + `syncNavReachHorizon` in Pass 4, or stub `reachSteps` on context in unit tests (not mock horizon objects).

---

## Pass 4 — Wire reach into live decisions

| File | Work |
|------|------|
| `createSnakeForageIntent.js`, `createFleeExploreIntent.js` | import sync/lookup; `requireSnakeVisionFrame`; local `reachStepsForMode`; pass `reachSteps` |
| `snakeDecisionModel.js`, `fleeDecisionModel.js` | `build*DecisionContext({ reachSteps })`; strip blackboard dist layers; delete `reachForCandidate`; scorers + `deriveSnakeThreatState` read `facts.reachSteps.*`; update `deriveAllyState` |
| Same PR only | extract duplicated `routeEvents` / `committedTargetMatches` if both models touched |

**Threat wiring:** `deriveSnakeThreatState(visibleWorld.threat, reachSteps.threat, cellSize)` — not `visibleWorld.threatDist`.

Tests: grid harness with `syncNavReachHorizon` — not injected `preyDist: 1`.

Expected behavior: prey visible through wall → `reachSteps.prey === null` → hunt `-Infinity` unless committed `pathLen`.

---

## Pass 5 — Grep gate + doc sync

```bash
rg 'preyDist|foodDist|allyDist|threatDist|enemyDist|lastDistanceCells|reachForCandidate|aggregateThreatSeverity' --glob '*.js'
rg 'buildNavReachHorizon|resolveSnakeReachConfig|resolveReachSteps' --glob '*.js'
rg 'Libraries/AI/decision' --glob '*.js'
```

Update [`../AI.md`](../AI.md) (reachSteps not allyDist; phase 1 = sync nav BFS not FlowFieldWindow; strike recommended #3). Link from [`normalization.md`](normalization.md). Optional one-line supersession in [`../pathfinding.md`](../pathfinding.md) Tier 3 future blurb.

Optional: delete unused `checkReachability` on flow types — not required for reach migration.

---

## Phase 2+ (after grep gate clean)

| Phase | Work | Reuses |
|-------|------|--------|
| 2a | Flee locomotion via backward flow | `FlowFieldWindow` + worker — **not** `navReachHorizon` for steering |
| 2b | Hybrid HPA waypoint + local flow | `navReachStepsTo` for reach gate + HPA `pathLen` for committed |
| 3 | Blended flee fields | replaces `pickFleeCell` heuristic |

Do not start until Pass 5 grep gate passes. Phase 2 **may** add worker/window — phase 1 deliberately does not.

---

## Review bar (full)

- [ ] One reach dialect: path steps everywhere in scoring/threat/cohesion
- [ ] Perception + memory: **targets only**
- [ ] `syncNavReachHorizon` / `navReachStepsTo` — no returned horizon objects
- [ ] Reach computed **once** per agent at intent adapter — not threaded through enrich
- [ ] No `Libraries/AI/decision/` or resolver getters
- [ ] `deriveAllyState` reads `facts.reachSteps.ally`, not `known.allyDist`
- [ ] No `*Dist` grep hits in `Libraries/`
- [ ] Tests use `gridToWorld` + real sync — not mock `{ stepsTo }`
- [ ] Net line count negative
- [ ] New species: sync + `navReachStepsTo` — do not invent new dist fields

---

## Related docs

| Doc | Role |
|-----|------|
| [`normalization.md`](normalization.md) | Dialect wins — this is Tier 2 AI reach |
| [`stupid.md`](stupid.md) | No getters / fake services |
| [`passthrough.md`](passthrough.md) | Why `*Dist` layers die |
| [`objects.md`](objects.md) | Scratch vs alloc |
| [`frame.md`](frame.md) | sync + read pattern |
| [`../AI.md`](../AI.md) | FSM stack · flow phase 2+ |
