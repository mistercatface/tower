# Game-changers — normalization wins after the frame pass

Cross-cutting refactors with **subsystem-wide payoff** — same spirit as bounds/AABB + scalar grid, but each item is independent of the others unless noted.

**Do first:** `Plans/frame.md` — frame draw pass is the render-stack dialect; several items below are easier or fold into it.

**Audit source:** `Plans/normalization.md` (index) · perf detail → `Plans/plan.md`

---

## Priority overview

| # | Item | Payoff | Effort | Depends on frame? |
|---|------|--------|--------|-------------------|
| **G1** | Forcefields → belt cache pattern | Finishes grid-stamp pipeline | Small | No |
| **G2** | Floor epoch / draw bump unification | Trustworthy grid edits | Medium | No |
| **G3** | Wall candidate bucket reuse | Sim tick GC / perf | Medium | No |
| **G4** | Entity query result pools | Render entity scaling | Small–medium | Helps if frame adds more queries |
| **G5** | Kinetic sleep / island stamps | Physics tick GC | Small | No |
| **G6** | ElevationCamera `Into` everywhere | Camera scratch dialect | Tiny | **Yes** — fold into frame Phase 4 |
| **G7** | Unified depth-sorted collect | One painter entry | Medium | **Yes** — do after frame |

**Suggested order:** G1 → frame (`Plans/frame.md`) → G2 → G3 → G4 → G5 → G7 (G6 inside frame).

---

## G1 — Forcefields on the belt cache pattern

**Where:** `Libraries/Sandbox/gridStampDrawCache.js` ✅ · `Libraries/Sandbox/drawForcefields.js` ⚠️

### Problem

Grid stamps are mandated to: **sync on revision key → stable proxies → viewport cull → `drawCachedPropSprite`**.

| Feature | Sync key | Proxy on rebuild |
|---------|----------|------------------|
| Floor belts / power | `floorOccupancyStampDrawCacheKey` | `Object.create(proto)` ✅ |
| Passage forcefields | `passageEdgeDrawCacheKey` | **`createForcefieldDrawProxy()` fresh literal** ⚠️ |

Forcefields already revision-cache and cull — but **`syncPassageEdgeDrawCache` allocates new proxy objects + nested `{ x, y }` on every key change**, and sync lives outside `gridStampDrawCache` while `clearGridStampDrawCaches` clears `_passageEdgeDrawCache` there.

### Fix

1. Move `syncPassageEdgeDrawCache` + `collectForcefieldEdgeDrawables` + `drawForcefieldEdgeProp` into `gridStampDrawCache.js` (or rename module → `gridStampDraw.js`).
2. Stable prototype proxy like belts — `_localP1/_localP2` on proto or scratch endpoints, not new literals per edge.
3. Dynamic tripwire state: mutate `proxy._forcefield.tripped` per frame (already done); cache key must include states that affect bake (`powered`, `mode`, `allowedSide` — already in `getCustomSpriteCacheKey`).
4. Export surface: `drawPassageForcefieldEdges(ctx, state, pass)` after frame pass exists; until then `pass.px/py` or scalars.

### Files

- `gridStampDrawCache.js` — absorb forcefield sync/draw
- `drawForcefields.js` — delete or reduce to recipe-only `forcefieldEdgeDraw`
- `WorldSceneRenderer.js` — import from grid stamp module
- `.cursor/rules/rendering-pipelines.mdc` — one module for all cell/edge stamps

### Review bar

- [ ] No `createForcefieldDrawProxy()` returning `{ x, y, getCustomSpriteCacheKey() {…} }` literals on sync.
- [ ] One place documents all grid-stamp sync keys (`gridNavEpoch.js` + stamp module).

---

## G2 — Unify floor layout bumps (`GRID_NAV_EPOCH` vs `_floorStampDrawRevision`)

**Where:** `Libraries/Spatial/grid/gridNavEpoch.js` · `WorldObstacleGrid` floor writes · `floorOccupancy.js`

### Problem

Nav invalidation: **`bumpGridNavEpoch(grid, channel)`** + **`commitGridNavEdit(bounds)`** — one spine.

Floor **draw** cache uses a **second bump**: `_floorStampDrawRevision`, called from:

- `WorldObstacleGrid` floor store writes (3 sites)
- `floorOccupancy.js` apply/notify paths (4 sites)

Key: `floorOccupancyStampDrawCacheKey = floorNavEpoch:cols:rows:_floorStampDrawRevision`

Callers must remember both bumps; easy to drift.

### Fix options (pick one in implementation)

**A — Derive draw key from floor epoch only**

- If every layout-affecting floor edit already bumps `GRID_NAV_EPOCH.Floor`, drop `_floorStampDrawRevision` and key off `floorNavEpoch + cols + rows`.
- Audit: bulk snapshot apply, grid direct writes, passage power layout — all must bump floor epoch.

**B — Centralize floor mutations**

- Single helper API (like `commitGridNavEdit`) that bumps floor epoch + draw revision + returns `CellBounds` for nav commit.
- All floor belt/power/clear paths go through it; no manual `bumpFloorOccupancyStampDrawRevision` at call sites.

### Files

- `gridNavEpoch.js` — key function + maybe delete bump helper
- `WorldObstacleGrid.js` — floor store mutation paths
- `floorOccupancy.js` — apply/stamp paths
- `tests/gridNavEpoch.test.js` — extend if key shape changes

### Review bar

- [ ] Zero direct `bumpFloorOccupancyStampDrawRevision` outside grid epoch module (or one helper).
- [ ] Edit floor in editor → belts + nav + surfaces invalidate without manual bump at call site.

---

## G3 — Wall candidate buckets — slab philosophy for spatial sim

**Where:** `Libraries/Spatial/world/SpatialFrameCore.js` — `_wallCandidatesNearWorld`

### Problem

Kinetic bodies: **`Float32Array` slabs**. Wall segment queries: every frame **`_wallBucketCache.clear()`** + on miss **`const segments = []`** + fill + `Map.set`.

Revision guard (`_wallBucketRevision`) avoids stale segments but **not** bucket container churn.

### Fix

- **Generation-stamped bucket arrays** — reuse `segments` buffer, mark with `wallGridRevision` or frame id; Map stores `{ gen, segments, count }` not fresh arrays.
- Or **fixed bucket ring** keyed by `(col, row, pad)` with slot reuse (like static wall proxy pool on grid).

### Files

- `SpatialFrameCore.js` — primary
- Possibly `WorldObstacleGrid` — if proxy pool ties in

### Review bar

- [ ] `resetFrame` does not `Map.clear()` entire wall bucket cache unless grid revision changed.
- [ ] Bucket miss does not allocate `[]` — reuses buffer with length/count.

**Plan.md ref:** Tier 2 #5.

---

## G4 — Entity `queryView` result array pooling

**Where:** `GameState/EntityRegistry.js`

### Problem

Good: `_candidateScratch`, `_kindSetScratch`, query cache by generation + bounds hash.

Bad: cache miss → **`result = []` + push**; render runs **3–5 queries** per pass (debris, floor, 3D, overlays, tiles). `spatialGen` often bumps between sim `begin` and render.

### Fix

- Module-level result buffers per known **`filterId`** slot (or fixed pool with `length = 0` reuse).
- Document: callers must not retain result array reference across frames (same as today).
- Optional: widen cache hit rate by decoupling render query generation from sim tick if safe.

### Files

- `EntityRegistry.js` — primary
- Audit call sites that mutate returned arrays in place

### Review bar

- [ ] Cache miss does not allocate new `[]` for hot filterIds (`debris`, `floor`, `3d`, `overlay`).
- [ ] No behavior change to query semantics / ordering.

**Plan.md ref:** Tier 2 #7.

---

## G5 — Kinetic sleep / islands — `Set` → generation stamp

**Where:** `kineticPhysicsPass.js`, `kineticIslands.js`, `kineticConstraintGraph.js`, `kineticConstraintSolver.js`

### Problem

Bodies on slab; island/sleep/graph walks allocate **`new Set()`** (sometimes nested). `islandRoot` already `Int32Array` on slab.

### Fix

- **`Uint8Array visited`** or stamp `body._physId` with pass generation — same pattern as broadphase elsewhere.
- One module-level stamp counter incremented per pass.

### Files

- 4 motion/collision files above

### Review bar

- [ ] No `new Set()` in kinetic tick hot path (grep check).
- [ ] Island membership results unchanged.

**Plan.md ref:** Tier 2 #11.

---

## G6 — ElevationCamera `Into` everywhere

**Where:** `ElevationCamera.js` · `animatedSurfaceDraw.js` · `losShadowOverlay.js`

### Problem

Structure pass uses `elevationCameraFromViewportInto` + module scratch. Animated surfaces and LOS shadow still call **`elevationCameraFromViewport()`** → fresh object.

### Fix

- Module scratch or **`drawPass.camera`** after frame pass.
- Delete allocator call sites; keep allocator export only for cold/tests if needed.

### Review bar

- [ ] Zero `elevationCameraFromViewport(` in world draw hot paths.

**Note:** Implement as **frame.md Phase 4**, not standalone.

---

## G7 — Unified depth-sorted drawable collection

**Where:** `WorldSceneRenderer` · `collectForcefieldEdgeDrawables` · static wall/rail collect

### Problem

Painter’s algorithm is correct but **collect → `_distSq` → sort** is duplicated:

- Floor props: query + sort inside `drawFloorProps`
- 3D pass: props + walls + forcefields → one sort in `draw3DBuildings`
- Forcefields: assign `_distSq` in collect

Two sorts per frame today (`plan.md` Tier 3).

### Fix (after drawPass)

1. Shared `_rankByDistSq(items, pass.px, pass.py)` helper.
2. Optional: **single collect pass** — merge floor + 3D + forcefield + wall drawables into `visibleDrawables` with layer tag; **one sort**; dispatch draw by tag.

### Files

- `WorldSceneRenderer.js` — primary
- Collect helpers may take `pass` instead of `px, py`

### Review bar

- [ ] One sort for combined structure pass (or documented why two remain).
- [ ] New render layer adds one collect hook, not a new sort loop.

**Depends on:** `Plans/frame.md` — pass owns `px/py` for dist ranking.

---

## Explicitly not game-changers

| Idea | Why |
|------|-----|
| Merge `CellBounds` + `Aabb2D` | Different domains; bridges exist |
| Overlay command list pooling | Editor pipeline; separate from world draw |
| `animatedSurfaceZone` registry delete | Dead scaffold — cleanup, not normalization |
| First-person / fixed iso render modes | New engine branch (`Plans/rendering.md`) |
| More indirection / barrels | `Plans/indirection.md` ✅ |

---

## How these connect

```text
G1 (grid stamps complete)
  ↓
frame pass (Plans/frame.md) — render dialect
  ↓
G6 (camera Into) + G7 (depth collect) — fold into frame PRs
  ↓
G2 (grid edit spine) — editor/sim trust
  ↓
G3 + G4 + G5 — sim/render perf parity with slabs
```

---

## Related docs

| Doc | Role |
|-----|------|
| `Plans/frame.md` | Frame draw pass — **do this next after G1** |
| `Plans/normalization.md` | Short audit index |
| `Plans/clean.md` | Sprite cache signatures after pass exists |
| `Plans/plan.md` | Allocation/scratch audit (perf numbers) |
| `Plans/indirection.md` | Wrapper cleanup ✅ |
| `.cursor/rules/rendering-pipelines.mdc` | Pipeline law |
