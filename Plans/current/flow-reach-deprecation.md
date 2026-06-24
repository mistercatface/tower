# Plan: Deprecate main-thread reach BFS → worker flow-field distance cache

**Status:** draft  
**Supersedes:** `fsmroadmap.md` Phase A (per-agent forward reach on worker) — **do not implement that path**  
**Goal:** Remove `syncNavReachHorizon` (~15% frame cost at ~192 agents/tick). Reuse existing flow worker backward BFS, cached per **target cell**, shared across agents.  
**Non-goals:** Per-agent forward BFS; main-thread spin-wait / two-pass perception flush; new reach SAB arena separate from flow slots.

---

## 0. What exists today

### Hot path (delete)

| File | What it does |
|------|----------------|
| `Libraries/Navigation/navReachHorizon.js` | Module-scratch forward BFS from agent; `syncNavReachHorizon` + `navReachStepsTo` |
| `Libraries/Game/snake/agentReachSteps.js` | Per slot: `navReachStepsTo(target)` or `routeStatus.pathLen` if committed |
| `Libraries/Game/snake/createGroundNavIntentAdapter.js` L230–239 | Every `perceiveWithMemory`: one `syncNavReachHorizon` + `buildAgentReachStepsInto` |

### Consumers (keep API shape `reachSteps`, change producer)

| File | Uses `reachSteps` for |
|------|------------------------|
| `Libraries/AI/agents/buildAgentDecisionContext.js` | `deriveThreatState`, `deriveAllyState`, passes to scoring |
| `Libraries/AI/agents/scoreDecisionModes.js` | `netScoreDetail(value, reach, cost)` — food/prey/ally/enemy |
| `Libraries/AI/agents/deriveThreatState.js` | severity / lethal from cell steps |
| `Libraries/AI/agents/deriveAllyState.js` | `allyState.dist` |
| `Libraries/AI/utility/utilityScoring.js` | `reach == null` → travel cost 0 |

### Flow infra (extend, do not replace)

| File | Today |
|------|--------|
| `Libraries/Pathfinding/FlowFieldGrid.js` | `MAX_CACHE = 100`; `sabFlowPool` = directions only; `ensureFlowRequest` / `getReadyFlowField` |
| `Libraries/Pathfinding/flowCacheManager.js` | Dedupes by `targetIdx` in flow window; **invalidates entire cache** on slot overflow |
| `Libraries/Pathfinding/flowFieldBfs.js` | Computes `bfsDistances` in worker scratch, **discards** after writing `vectorMap` |
| `Libraries/Workers/Navigation/FlowFieldWorkerEntry.js` | `updateFlow` → `computeFlowField` → `flowDone` |
| `Libraries/Pathfinding/flowSteering.js` | `getReadyFlowField` → null if not ready (**no blocking**) |

### Config

| Key | Location |
|-----|----------|
| `shared.decisionReachHorizon: 32` | `Config/games/snake.js` L75 — becomes flow `range` cap for decision fields |
| `reachSlots` | `Config/games/snake.js` — maps slot → `{ targetKey, mode }`; **keep** (drives which targets get distance reads) |

---

## 1. Target architecture

```
per agent perceive (sync, no await):
  1. resolve flowFieldGrid from state
  2. ensure flow window covers agent + visible targets (recenter if needed)
  3. for each reachSlot entry with a live target:
       ensureFlowRequest(target.x, target.y, decisionReachHorizon)  // deduped, async post
       reachSteps[slot] = readFlowTargetSteps(...)                   // tiered, instant
  4. buildDecisionContext({ reachSteps, ... })

readFlowTargetSteps tiers (in order):
  A. committed mode+targetId match + routeStatus.hasRoute → routeStatus.pathLen
  B. flow slot ready → readFlowStepsFromSlot(slot, agentX, agentY)
  C. staleDistCache hit (same target nav cell, age ≤ STALE_TICKS) → cached steps
  D. octileDistance(agent cell, target cell) on obstacle grid
  E. null (unreachable / outside window — rare if D runs)
```

**Async rule:** Same as locomotion — `getReadyFlowField` pattern. **Never** `waitForSlot` on the main thread during perceive. **Never** two-pass vision/decision flush.

**Equivalence:** Backward flow BFS from goal gives the same grid step count at the agent cell as forward reach BFS on the same octile nav graph (within the flow window and `range`).

---

## 2. Phase 1 — Persist flow distances in worker + host

### 2.1 `Libraries/Pathfinding/flowFieldBfs.js`

- [ ] Change `computeFlowField` to accept optional `distancesOut` (Int32Array subarray for the slot).
- [ ] After BFS completes, if `distancesOut` provided: `distancesOut.set(bfsDistances)` (or copy only `gridSize` elements).
- [ ] Document sentinel: **`-1` = unreachable / unvisited** (already what `bfsDistances` uses before BFS; keep fill `-1` at start).
- [ ] Do **not** change vector encoding (`255` = no direction).

### 2.2 `Libraries/Workers/Navigation/FlowFieldWorkerEntry.js`

- [ ] In `FlowBufferManager.init(data)`:
  - Read `data.sabFlowDistPool` (new SAB).
  - Store `this.flowDistPool = new Int32Array(data.sabFlowDistPool)`.
- [ ] Add `getDistanceMap(slot)` mirroring `getVectorMap(slot)`:
  ```js
  getDistanceMap(slot) {
      const offset = slot * this.gridSize;
      return this.flowDistPool.subarray(offset, offset + this.gridSize);
  }
  ```
- [ ] In `updateFlow` handler, after `computeFlowField(vectorMap, { ... })`:
  - Pass `distancesOut: this.buffers.getDistanceMap(slot)`.
- [ ] `init` message must include `sabFlowDistPool` alongside existing SABs.

### 2.3 `Libraries/Pathfinding/FlowFieldGrid.js`

- [ ] Bump `MAX_CACHE` constant (e.g. `100` → `256` or `512` — pick one; document bytes: `gridSize * 4 * MAX_CACHE`).
- [ ] In constructor, after `sabFlowPool`:
  ```js
  this.sabFlowDistPool = new SharedArrayBuffer(size * MAX_CACHE * 4);
  ```
- [ ] Add to `init` postMessage: `sabFlowDistPool: this.sabFlowDistPool`.
- [ ] Add methods:
  - `flowDistanceView(slot)` → `Int32Array` subarray over `sabFlowDistPool`.
  - `readFlowStepsAt(slot, worldX, worldY)`:
    1. Map world → flow cell `(col, row)` using `worldToGrid` / frame (same math as `sampleFlowDirectionOnGrid`).
    2. `idx = row * cols + col`; if OOB → `null`.
    3. `dist = flowDistanceView(slot)[idx]`.
    4. Return `dist >= 0 ? dist : null`.
  - `readFlowStepsForTarget(agentX, agentY, targetX, targetY, range)`:
    1. `syncLocalTopology()` (existing).
    2. `slot = ensureFlowRequest(targetX, targetY, range)` — **always** posts if missing.
    3. If `!isFlowSlotReady(slot)` → return `{ slot, steps: null, ready: false }`.
    4. Else → `{ slot, steps: readFlowStepsAt(slot, agentX, agentY), ready: true }`.

### 2.4 `Libraries/Pathfinding/flowCacheManager.js` (optional in Phase 1, required before 500 targets)

- [ ] Replace “invalidate all on overflow” with LRU:
  - Track `slot → targetIdx` and `targetIdx → slot`.
  - On allocate when full: evict oldest slot, clear `cacheLookup[evictedTargetIdx]`, reuse slot index.
- [ ] On `invalidate(protocol)`: clear lookup + LRU order (keep current behavior for topology/window invalidation).

### 2.5 Tests (new)

- [ ] Add `tests/flowFieldDistance.test.js`:
  - Use `FlowFieldWorker` in-process (same pattern as `tests/flowReachHorizonWorker.test.js` if present, else `FlowFieldWorkerEntry` + mock `self.postMessage`).
  - Open grid: target at `(5,5)`, agent at `(2,5)` → expect `steps === 3`.
  - Wall between agent and target → agent side `-1`/null, reachable side has finite dist.
  - Assert `flowDone` still fires; direction bytes unchanged.

**Phase 1 done when:** Worker writes distances; host can `readFlowStepsAt` on a ready slot; unit test green. **No game wiring yet.**

---

## 3. Phase 2 — Stale distance cache (main thread)

### 3.1 New file: `Libraries/Navigation/flowReachStaleCache.js`

- [ ] Export `createFlowReachStaleCache({ maxEntries = 512, staleTicks = 3 })`.
- [ ] Key: `` `${navCol},${navRow}` `` from `grid.worldCol(target.x)`, `grid.worldRow(target.y)` (stable across agents).
- [ ] `remember(key, steps, tickId)` — called when `readFlowStepsForTarget` returns `ready: true`.
- [ ] `lookup(key, tickId)` — returns `steps` if `tickId - entry.tick <= staleTicks`, else `null`.
- [ ] `clear()` — call from flow window invalidation hook (Phase 3).

### 3.2 Wire stale writes

- [ ] In `readFlowStepsForTarget` (or wrapper), on successful read: `staleCache.remember(key, steps, simTick)`.
- [ ] `simTick` from `state.sandbox.snakeGame.simTick` (already exists on perception).

**Phase 2 done when:** Cache unit tests; remember/lookup/expiry behavior verified.

---

## 4. Phase 3 — Replace reach producer in intent adapter

### 4.1 New file: `Libraries/Navigation/flowTargetSteps.js`

Replace `agentReachSteps.js` responsibilities (live path, not deprecated yet).

- [ ] `resolveFlowFieldGrid(state)` → `state.flowFieldGrid ?? state.nav?.flowFieldGrid ?? null`.
- [ ] `readCommittedPathLen(target, mode, committed, routeStatus)` — lift logic from `agentReachSteps.reachStepsForMode` lines 4–11 (pathLen only).
- [ ] `readTargetSteps({ state, agent, target, mode, committed, routeStatus, slotConfig, staleCache, range })`:
  1. If no target → `null`.
  2. If committed path len applies → return it.
  3. If no `flowFieldGrid` → `octileDistance` fallback (import from `GridUtils.js`).
  4. `ensureRollTargetWindow` or minimal window sync: agent + target must be in window — call `flowFieldGrid.ensureRollTargetWindow(agent.x, agent.y, target.x, target.y, recenterThreshold)` with `state.nav.settings.recenterThreshold`.
  5. `readFlowStepsForTarget(agent.x, agent.y, target.x, target.y, range)`.
  6. If `ready` → return `steps` (remember stale).
  7. Else `staleCache.lookup(navCellKey, tick)` → if hit return.
  8. Else `octileDistance(agent, target)` in cell space.
- [ ] `buildFlowTargetStepsInto(out, memoryWorld, committed, routeStatus, reachSlots, ctx)` — same loop shape as `buildAgentReachStepsInto` but calls `readTargetSteps` per slot.

### 4.2 `Libraries/Game/snake/createGroundNavIntentAdapter.js`

- [ ] **Remove** imports: `syncNavReachHorizon`, `buildAgentReachStepsInto` from reach modules.
- [ ] **Add** imports: `buildFlowTargetStepsInto`, `createFlowReachStaleCache` from new modules.
- [ ] At adapter factory scope (per intent instance): `const staleCache = createFlowReachStaleCache()`.
- [ ] In `perceiveWithMemory`:
  - **Delete** line `syncNavReachHorizon(nav, agent.x, agent.y, ...)`.
  - **Delete** dependency on `requireSnakeVisionFrame(state).navTopology` for reach only (topology still needed elsewhere).
  - **Replace** `buildAgentReachStepsInto(...)` with:
    ```js
    buildFlowTargetStepsInto(reachSteps, memoryWorld, committed, routeStatus, reachSlots, {
        state, agent, staleCache, range: config.decisionReachHorizon ?? 32,
    });
    ```
- [ ] On flow topology invalidation (optional hook): if `flowFieldGrid` invalidates slots, `staleCache.clear()`.

### 4.3 `state.flowFieldGrid` alias for snake

Snake tests/runtime use `state.nav.flowFieldGrid`; drag-nav uses `state.flowFieldGrid`.

- [ ] In `resolveFlowFieldGrid` (above), handle both.
- [ ] Verify `createWorkerNavigation` / `wireSnakeTestGame` paths expose `nav.flowFieldGrid` (already via `NavRuntime`).

### 4.4 Config rename (optional, can defer)

- [ ] `decisionReachHorizon` → `decisionFlowRange` in `Config/games/snake.js` + `getSharedConfig` consumers **or** keep name and document it now means flow BFS `range` param.

**Phase 3 done when:** Game runs with zero calls to `syncNavReachHorizon`; profiler shows reach BFS gone; snakes still transition FSM; no frame freeze.

---

## 5. Phase 4 — Deprecate main-thread reach

### 5.1 Move files

| From | To |
|------|-----|
| `Libraries/Navigation/navReachHorizon.js` | `Libraries/deprecated/reach/navReachHorizon.js` |
| `Libraries/Game/snake/agentReachSteps.js` | `Libraries/deprecated/reach/agentReachSteps.js` |
| `tests/navReachHorizon.test.js` | `Libraries/deprecated/reach/navReachHorizon.test.js` |

### 5.2 `Libraries/deprecated/reach/README.md`

- [ ] State: forward main-thread BFS removed from hot path on `<date>`.
- [ ] Replacement: backward flow distance cache (`flowTargetSteps.js`).
- [ ] Reason: per-agent forward BFS did not scale; flow dedupes per target.
- [ ] Do not import from deprecated in production code — grep gate below.

### 5.3 Grep gates (CI / manual)

```bash
# Must return zero hits outside deprecated/ and Plans/
rg "syncNavReachHorizon|navReachStepsTo" Libraries/ GameState/ Config/ tests/ --glob '!**/deprecated/**'
rg "from.*agentReachSteps" Libraries/ --glob '!**/deprecated/**'
```

---

## 6. Phase 5 — Tests & docs

### 6.1 Tests to run

```bash
node scripts/run-tests.mjs tests/flowFieldDistance.test.js
node scripts/run-tests.mjs tests/snakeDecisionModel.test.js   # unchanged — injects reachSteps
node scripts/run-tests.mjs tests/snakeFsmTransitions.test.js
node scripts/run-tests.mjs tests/fleeAgentDecision.test.js
node scripts/run-tests.mjs tests/nodeWorkerShim.test.js
```

### 6.2 `tests/snakeDecisionModel.test.js`

- [ ] **No changes required** for unit tests — they pass explicit `reachSteps` / `inferReachSteps`.
- [ ] Optional: add one integration test with real `FlowFieldGrid` + `buildFlowTargetStepsInto` behind worker shim.

### 6.3 `tests/snakeFsmTransitions.test.js`

- [ ] Run full suite after Phase 3.
- [ ] If flee/seek timing shifts (octile fallback first frames): adjust entity positions or wait extra ticks — **do not** reintroduce sync BFS.

### 6.4 Plan doc updates

- [ ] `Plans/current/fsmroadmap.md` — strike Phase A worker-forward-reach; point here.
- [ ] `Plans/pathfinding.md` L230–236 — update “per-agent local horizons” to flow-distance cache.
- [ ] `Plans/AI.md` — `facts.reachSteps` sourced from flow cache + fallbacks.

---

## 7. Async behavior reference (do not screw this up)

| Situation | Behavior |
|-----------|----------|
| Slot not ready same frame | Use stale cache → octile → never block |
| First time seeing target | Octile for 1–3 frames; flow request in flight |
| 50 agents, 1 food shard | **1** `updateFlow` BFS, 50 reads |
| Window recenters | `invalidateFlowSlots` → stale cache clear; octile until fields warm |
| `reach === null` in scoring | Travel cost 0 (`utilityScoring.js` L14) — **avoid** by using octile tier D |
| Threat visible, dist null | `threatState` null → flee score → `Infinity` (safe but blunt) — prefer octile for threat |
| Committed + `pathLen` | Always tier A — no flow read needed |

### Anti-patterns (failed attempt)

- ❌ `flushReachHorizonBatch` + `await` all slots before decision
- ❌ `waitReachNavWorkerReadySync` busy-wait on main thread
- ❌ Separate reach SAB per agent
- ❌ Forward BFS on worker duplicated per agent

---

## 8. Performance acceptance

| Metric | Before | After |
|--------|--------|-------|
| `syncNavReachHorizon` calls / tick | ~agent count | **0** |
| `updateFlow` BFS / tick | locomotion only | locomotion + **unique decision targets** |
| Main-thread BFS in profiler | ~15% | **~0%** |
| Frame hitch on first frame | N/A | **no** sync wait |

**Sanity:** With 336 agents and ~20 unique visible food targets, expect ~20 flow BFS jobs/tick (not 336).

---

## 9. Implementation order (single PR series)

```
PR1  Phase 1 — dist pool + worker write + FlowFieldGrid read API + flowFieldDistance.test.js
PR2  Phase 2 — stale cache module + tests
PR3  Phase 3 — flowTargetSteps.js + createGroundNavIntentAdapter swap
PR4  Phase 4 — move deprecated + grep gates + fsmroadmap update
```

---

## 10. File checklist (copy for PR description)

**New**

- `Libraries/Navigation/flowTargetSteps.js`
- `Libraries/Navigation/flowReachStaleCache.js`
- `tests/flowFieldDistance.test.js`
- `Libraries/deprecated/reach/README.md`

**Modified**

- `Libraries/Pathfinding/flowFieldBfs.js`
- `Libraries/Pathfinding/FlowFieldGrid.js`
- `Libraries/Pathfinding/flowCacheManager.js` (LRU)
- `Libraries/Workers/Navigation/FlowFieldWorkerEntry.js`
- `Libraries/Game/snake/createGroundNavIntentAdapter.js`
- `Plans/current/fsmroadmap.md`

**Moved to deprecated**

- `Libraries/Navigation/navReachHorizon.js`
- `Libraries/Game/snake/agentReachSteps.js`
- `tests/navReachHorizon.test.js`

**Unchanged (consumer contract)**

- `reachSteps` field name on decision context
- `reachSlots` in `Config/games/snake.js`
- `scoreDecisionModes.js`, `deriveThreatState.js`, `buildAgentDecisionContext.js`
