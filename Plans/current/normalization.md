# Normalization audit — cross-cutting patterns that unlock whole subsystems

Unlike the completed indirection pass (wrapper/barrel cleanup), this doc tracks **structural patterns** where one API shape or one engine-owned pass struct clears up dozens of call sites — the same class of win as the bounds/AABB + scalar grid work.

**Reference win (what “big” feels like):**

| Layer        | Before                                                          | After                                                                                            |
| ------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| World bounds | Ad-hoc `{ minX, maxX, … }`, fresh objects in loops              | `Aabb2D` + `createAabb` + `*Into` scratch (`chunkWorldAabbScratch`, `intersectAabbOptionalInto`) |
| Grid indices | `gridToWorld()` → `{ x, y }` in hot paths                       | Scalars on `WorldObstacleGrid` (`worldCol`, `gridCenterX`, …)                                    |
| Chunk draw   | New AABB + camera object per chunk                              | Pass `viewport`; ground blit skips mutation entirely                                             |
| Floor belts  | Per-cell proxy + closure every frame                            | Revision cache in `gridStampDrawCache.js` (sync on key, cull + blit per frame)                   |
| Frame draw   | `worldSceneDrawInput`, `ElevationCamera`, `wallCtx`, px/py soup | `draw*(ctx, state, viewport)` — [`frame.md`](frame.md)                                           |

Those weren’t micro-optimizations — they **picked one dialect** and made whole folders speak it.

**Do first:** [`stupid.md`](stupid.md) P3 prop catalog · [`passthrough.md`](passthrough.md) Tier 1 · [`library_defaults.md`](library_defaults.md)

**Full outlines:** [`frame.md`](frame.md) · [`gamechangers.md`](gamechangers.md) (G1–G7) · [`fsmroadmap.md`](fsmroadmap.md) (AI reach)

---

## Tier 2 — AI consumer dedupe ([`fsmroadmap.md`](fsmroadmap.md) Part 1) — **next**

**Where:** `createSnakeForageIntent` / `createFleeExploreIntent`, `*DecisionModel.js`, `*IntentMemory.js`, `snakeIntent.js` / `fleeWorldPerception.js`

**Before:** flee imports generic derives from `snakeDecisionModel.js`; twin ~270-line intent adapters; duplicate memory/perception/decision helpers

**After:** shared modules in `Libraries/AI/` (concrete files, no `decision/` package); species adapters thin; net −LOC

**Gate:** Part 1 grep gates in [`fsmroadmap.md`](fsmroadmap.md) before Phase 2 flow locomotion.

---

## Tier 2 — AI / decision reach ([`fsmroadmap.md`](fsmroadmap.md) phase 1) — **done** ✅

**Where:** `flowTargetSteps.js`, intent adapters, `snakeDecisionModel` / `fleeDecisionModel`

**Before:** `*Dist` passthrough → `reachForCandidate` → mixed pixel/cell dialect

**After:** `flowTargetSteps` · `facts.reachSteps` · threat derive in cells

---

## Tier 1 — Frame draw pass — **done** ([`frame.md`](frame.md))

`draw*(ctx, state, viewport)`. Deleted `worldSceneDrawInput`, `ElevationCamera`, `wallCtx`, px/py at draw entry. G1 forcefields in `gridStampDrawCache.js`.

**Next render win:** sprite cache keys ([`clean.md`](../clean.md)) · merged depth sort (G7).

---

## Tier 2 — Spatial / sim dialect (physics parity with slabs)

### 3. Wall candidate buckets — stop Map clear + `[]` per query

**Where:** `Libraries/Spatial/world/SpatialFrameCore.js` — `_wallCandidatesNearWorld`

**What:** Kinetic bodies use `Float32Array` slabs; wall segment gathering still **`Map.clear()` + `const segments = []` on every bucket miss** every frame. Revision guard exists (`_wallBucketRevision`) but bucket **containers** are ephemeral.

**Fix:** Fixed bucket ring or generation-stamped arrays (same trick as broadphase visited flags). Aligns spatial sim with physics investment.

**Touches:** 1–2 files. **Payoff:** sim tick under many wall queries; same “one philosophy” as AABB/scalars.

---

### 4. Kinetic sleep / island walks — `Set` → generation stamp on slab

**Where:** `kineticPhysicsPass.js`, `kineticIslands.js`, `kineticConstraintGraph.js`, `kineticConstraintSolver.js`

**What:** Bodies on slab; graph walks allocate **`new Set()`** (sometimes nested) per pass. `islandRoot` is already `Int32Array`.

**Fix:** `Uint8Array` or generation counter on `_physId` — identical pattern to entity broadphase elsewhere.

**Touches:** 4 files. **Payoff:** physics tick GC; low conceptual risk.

---

## Tier 3 — Grid edit / invalidation spine (partially done)

### 6. Unify draw-cache bumps with `GRID_NAV_EPOCH`

**Where:** `gridNavEpoch.js`, `WorldObstacleGrid` floor writes, `floorOccupancy.js`

**What:** Nav topology uses **`bumpGridNavEpoch(grid, channel)`** + `commitGridNavEdit(bounds)`. Floor **draw** cache uses a **separate** `_floorStampDrawRevision` bumped from 4+ places (grid writes + occupancy apply paths). Keys compose both: `floorOccupancyStampDrawCacheKey = floorNavEpoch:cols:rows:_floorStampDrawRevision`.

**Smell:** Two bump mechanisms for one conceptual “floor layout changed”. Some grid mutations bump both; callers must remember the draw revision.

**Fix options (pick one):**

- **A.** Drop `_floorStampDrawRevision`; derive stamp cache key only from `floorNavEpoch` + grid dimensions (if every layout edit already bumps floor epoch).
- **B.** Centralize floor mutations through helpers that always bump the right channels (like `commitGridNavEdit` for draw + nav).

**Touches:** grid epoch + floor store writers. **Payoff:** fewer forgotten bumps; simpler mental model for “edit floor → caches invalidate”.

---

### 7. Depth-sorted drawable collection — one painter entry (G7)

**Where:** `WorldSceneRenderer` (3× query + `_distSq` + sort), `collectForcefieldEdgeDrawables`, `StaticGridWallDraw` / edge rails

**What:** Painter's algorithm is correct but **collect → assign `_distSq` → sort** is copy-pasted with `visibleDrawables` reused as a shared buffer (good) but **logic duplicated** (floor props sort inside `drawFloorProps`; 3D sort in `draw3DBuildings`; forcefields push into same array).

**Fix:** Single `_collectDepthSorted(state, viewport, layers)` or at least shared rank helper + one sort before unified draw loop.

**Touches:** `WorldSceneRenderer` primarily. **Payoff:** one place to add render layers; fewer sort passes.

---

## Explicitly not a “big normalization” (don’t bait yourself)

| Idea                                                        | Why skip or defer                                                                                                                  |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Merge `CellBounds` and `Aabb2D` into one type               | Different domains (grid edit vs world space). Bridge already exists.                                                               |
| Overlay command pooling                                     | Real win in editor, but **different pipeline**. Do if editor perf matters.                                                         |
| Delete `animatedSurfaceZone` registry                       | Dead scaffold — cleanup, not normalization.                                                                                        |
| First-person / fixed iso modes                              | New renderer branch (`Plans/rendering.md`), not consolidating overhead path.                                                       |
| Per-agent flow windows for utility reach                    | Phase 2 locomotion; phase 1 = sync BFS ([`fsmroadmap.md`](fsmroadmap.md))                                                         |
| Generic AI slot pipeline / `Libraries/AI/decision/` package | Two consumers — **Part 1** dedupes into concrete `Libraries/AI/*` files, not a framework folder ([`fsmroadmap.md`](fsmroadmap.md)) |

---

## Suggested order (ROI × normalization breadth)

| Order | Item                                                                        | Why first                                                           |
| ----- | --------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **0** | **AI consumer dedupe** ([`fsmroadmap.md`](fsmroadmap.md) Part 1)            | Gate for flow locomotion; flee must not import snake decision model |
| **1** | **Prop catalog passthrough** ([`passthrough.md`](passthrough.md) Tier 1)    | Kill twin maps + load/getter theater                                |
| **2** | **Library defaults getters** ([`library_defaults.md`](library_defaults.md)) | Same pattern as deleted boot getters                                |
| **3** | **#6 Floor epoch / draw bump**                                              | Makes grid edits trustworthy                                        |
| **4** | **#3 Wall buckets**                                                         | Sim tick; independent of render                                     |
| **5** | **#5 Query result pools**                                                   | Render entity count scaling                                         |
| **6** | **#4 Sleep Set → stamp**                                                    | Physics GC; easy                                                    |
| **7** | **#7 Unified depth collect**                                                | G7 after frame landed                                               |

---

## How to know you got it (review bar)

- [x] New world draw code passes **`viewport` + `state`**, not scalar copies or sync bags
- [ ] New grid stamp feature adds **one sync key + proto proxy + draw entry** — not a new cache module
- [ ] Hot grid iteration uses **scalars or `*Into`**, not `{ col, row }` / `{ x, y }`
- [ ] Grid edit path ends in **`commitGridNavEdit(bounds)`** — draw/nav bumps not manual at each callsite
- [ ] Hot path reach uses **`flowTargetSteps`**, not `*Dist` or horizon objects — [`fsmroadmap.md`](fsmroadmap.md) phase 1 ✅
- [ ] New agent species imports shared AI modules — not copy-paste from `Libraries/Game/snake/` — [`fsmroadmap.md`](fsmroadmap.md) Part 1

---

## Related docs

- [`fsmroadmap.md`](fsmroadmap.md) — active plan (Part 1 dedupe · Part 2 flow)
- [`frame.md`](frame.md) — frame draw pass (done)
- [`passthrough.md`](passthrough.md) — passthrough audit
- [`stupid.md`](stupid.md) — broader stupid-shit queue
- [`gamechangers.md`](gamechangers.md) — G1–G7 implementation outlines
- [`objects.md`](objects.md) — allocation/scratch audit (perf lens)
- `Plans/clean.md` — sprite cache positional API
- `.cursor/rules/rendering-pipelines.mdc` — grid stamp + overlay pipeline law
