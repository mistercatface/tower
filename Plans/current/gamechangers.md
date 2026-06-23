# Game-changers — normalization wins after the frame pass

Cross-cutting refactors with **subsystem-wide payoff** — same spirit as bounds/AABB + scalar grid, but each item is independent unless noted.

**Do first:** [`frame.md`](frame.md) — frame draw pass is the render-stack dialect; several items below fold into it.

**Index:** [`normalization.md`](normalization.md) · perf detail → [`objects.md`](objects.md)

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

**Suggested order:** G1 → [`frame.md`](frame.md) → G2 → G3 → G4 → G5 → G7 (G6 inside frame).

---

## G1 — Forcefields on the belt cache pattern ✅

**Where:** `Libraries/Sandbox/gridStampDrawCache.js`

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

- [x] No `createForcefieldDrawProxy()` returning fresh `{ x, y, getCustomSpriteCacheKey() {…} }` literals on sync.
- [x] One place documents all grid-stamp sync keys (`gridNavEpoch.js` + stamp module).

---

## G2 — Unify floor layout bumps (`GRID_NAV_EPOCH` vs `_floorStampDrawRevision`)

**Where:** `Libraries/Spatial/grid/gridNavEpoch.js` · `WorldObstacleGrid` floor writes · `floorOccupancy.js`

### Problem

Nav invalidation: **`bumpGridNavEpoch(grid, channel)`** + **`commitGridNavEdit(bounds)`** — one spine.

Floor **draw** cache uses a **second bump**: `_floorStampDrawRevision`, called from `WorldObstacleGrid` floor writes and `floorOccupancy.js` apply paths.

Key: `floorOccupancyStampDrawCacheKey = floorNavEpoch:cols:rows:_floorStampDrawRevision`

### Fix options (pick one in implementation)

**A — Derive draw key from floor epoch only** — drop `_floorStampDrawRevision` if every layout edit bumps `GRID_NAV_EPOCH.Floor`.

**B — Centralize floor mutations** — one helper bumps floor epoch + draw revision + returns `CellBounds` for nav commit (like `commitGridNavEdit`).

### Review bar

- [ ] Zero direct `bumpFloorOccupancyStampDrawRevision` outside grid epoch module (or one helper).
- [ ] Edit floor in editor → belts + nav + surfaces invalidate without manual bump at call site.

---

## G3 — Wall candidate buckets — slab philosophy for spatial sim

**Where:** `Libraries/Spatial/world/SpatialFrameCore.js` — `_wallCandidatesNearWorld`

### Problem

Kinetic bodies: **`Float32Array` slabs**. Wall segment queries: **`_wallBucketCache.clear()`** + on miss **`const segments = []`**.

### Fix

Generation-stamped bucket arrays or fixed bucket ring keyed by `(col, row, pad)`.

### Review bar

- [ ] `resetFrame` does not `Map.clear()` entire wall bucket cache unless grid revision changed.
- [ ] Bucket miss does not allocate `[]` — reuses buffer with length/count.

**See:** [`objects.md`](objects.md) Tier 2 #5.

---

## G4 — Entity `queryView` result array pooling

**Where:** `GameState/EntityRegistry.js`

### Problem

Cache miss → **`result = []` + push**; render runs **3–5 queries** per pass.

### Fix

Fixed result buffers per known **`filterId`** slot; callers must not retain result reference across frames.

### Review bar

- [ ] Cache miss does not allocate new `[]` for hot filterIds (`debris`, `floor`, `3d`, `overlay`).

**Detail:** [`queryview-pooling.md`](queryview-pooling.md) · perf → [`objects.md`](objects.md) Tier 2 #7.

---

## G5 — Kinetic sleep / islands — `Set` → generation stamp

**Where:** `kineticPhysicsPass.js`, `kineticIslands.js`, `kineticConstraintGraph.js`, `kineticConstraintSolver.js`

### Fix

`Uint8Array visited` or stamp `body._physId` with pass generation.

### Review bar

- [ ] No `new Set()` in kinetic tick hot path.

**See:** [`objects.md`](objects.md) Tier 2 #11.

---

## G6 — ElevationCamera `Into` everywhere

**Where:** `ElevationCamera.js` · `animatedSurfaceDraw.js` · `losShadowOverlay.js`

### Fix

Module scratch or **`drawPass.camera`** after frame pass. Implement as **[`frame.md`](frame.md) Phase 4**, not standalone.

---

## G7 — Unified depth-sorted drawable collection

**Where:** `WorldSceneRenderer` · `collectForcefieldEdgeDrawables` · static wall/rail collect

### Fix (after drawPass)

Shared `_rankByDistSq(items, pass.px, pass.py)`; optional single collect + one sort for structure pass.

### Review bar

- [ ] One sort for combined structure pass (or documented why two remain).

**Depends on:** [`frame.md`](frame.md).

---

## Explicitly not game-changers

| Idea | Why |
|------|-----|
| Merge `CellBounds` + `Aabb2D` | Different domains; bridges exist |
| Overlay command list pooling | Editor pipeline; separate from world draw |
| `animatedSurfaceZone` registry delete | Dead scaffold — cleanup, not normalization |
| First-person / fixed iso render modes | New engine branch (`Plans/rendering.md`) |

---

## Related docs

| Doc | Role |
|-----|------|
| [`frame.md`](frame.md) | Frame draw pass — **after G1** |
| [`normalization.md`](normalization.md) | Short audit index |
| [`objects.md`](objects.md) | Allocation/scratch audit (perf) |
| `Plans/clean.md` | Sprite cache signatures after pass exists |
| `.cursor/rules/rendering-pipelines.mdc` | Pipeline law |
