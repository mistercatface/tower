# Parameter soup / library-style refactors

- [x] **`drawImageQuad` src/dst struct** — `ImageQuadBlit` `{ img, sx0..sy1, d0..d3 }`; textured cells pass `{ ...cell, img }`.
- [ ] **`drawKinematicsFrameToCanvas` bundle** — sprite bake scratch + rig + viewContext.
- [ ] **`NavigationContext`** — `planHpaSteering` / `replanPath` duplicate 11-arg nav infra list.
- [ ] **`getStaticRoofDrawCanvas` / mask bake** — fold `buildStaticRoofMaskCanvas` coords into `ChunkDrawPass` (partially done via `getStaticRoofDrawCanvas(pass, …)`).

# Hot-path cache / hoist

## Per-frame render

- [x] **Hoist `ElevationCamera` to draw pass** — build once on `wallCtx` in `draw3DBuildings`; stop calling `elevationCameraFromViewport` per wall in `drawProjectedWallFace`.
- [x] **Cache static grid wall visibility collection** — `collectStaticGridWallDrawables` rescans every viewport cell every frame; chunk/tile cache invalidated on grid/static-layer edits.
- [x] **Cache camera on `ChunkDrawPass`** — set `pass.camera` when the pass is built; stop rebuilding via `elevationCameraFromChunkPass` inside `projectHorizontalSurfaceCornersInto`.
- [x] **Dedupe roof `collectPass` per chunk** — `clipChunkToRoofFootprints` and `drawRoofSegmentDamageOverlays` repeat the same chunk col/row query; run once per chunk and reuse.
- [x] **Stash resolved wall atlas on drawable** — after first `getOrEnsureWallAtlas` hit, keep `{ key, canvases }` on the drawable for the frame (or until invalidation) instead of re-running profile resolve + lookup every draw.
- [ ] **Cache `computeWallFaceSubdiv` on drawable** — subdiv depends on viewer distance; cache on drawable keyed by quantized `(viewerX, viewerY)` since LOD changes slowly.
- [ ] **`blitWallFaceSubdiv` row/col band tables** — precompute row `v0`/`v1`/`sy0`/`sy1` bands and col `u`/`sx` bands once (`subdivY`/`subdivX` are tiny).
- [ ] **Face-level AABB cull before per-quad cull** — if the whole projected face is inside `worldBounds`, skip `pointsAabbOverlapAabb` per quad.
- [ ] **`drawImageQuad` canvas save/restore cost** — two `drawImageTriangle` calls per quad (inherent Canvas cost); main lever is fewer subdiv quads via distance LOD.

## Bake-time hot loops

- [x] **`warpPoint` allocation in domain warp pass** — `writeDomainWarp` / `warpPoint` returns `{ x, y }` per pixel; write into scratch arrays instead.
- [x] **Row-hoist `writeWallFacePixel`** — for fixed `y`, fold/top-edge branch and `v` are constant; only `dist = x * invPpwu` varies across the row.
- [ ] **Precompute `writeWallCellPixel` V span** — `(height - 1)` denominator is constant per bake; store `invWallCellVSpan` on `mapCtx`.
- [ ] **`composeSurfaceImage` per-motif full-pixel passes** — each applicable motif scans all pixels; consider offline motif bake or tile-based processing for heavy profiles.

## Minor

- [ ] **Read `getTexelResolution(settings)` once per draw pass** — `WorldSurfaceEngine` calls it repeatedly per chunk/wall path.
- [ ] **Drop redundant `gridCellToGlobalColRow` in `resolveStaticWallHeightAtCell`** — index static layers directly from local `(col, row)` when possible.
- [ ] **Batch or cache `getStaticCellDamageAlphaAtGrid`** — per-wall call in draw loop; worth caching if many damaged cells are visible.

# EntityRegistry — instance masterlist + bounds query cache

**Goal:** one authoritative instance index over existing storage (`pickups`, `sandboxPads`, …). Arrays stay source of truth; registry holds `Map<id, { kind, ref }>`, central lookup, and the first real consumer — **cached bounds queries** — so sim/render stop linear-scanning full lists.

**Not in scope:** UI/selection (sandbox editor hit-test, multi-select, link validation on delete). `EntityGrid` / `SpatialFrameCore` stay for physics broadphase; `PropCatalog` / `WallSpatialIndex` unchanged.

## Step 1 — Instance masterlist

- [ ] **`EntityRegistry`** on game state — `get(id)`, `getRef(id)`, `membershipGen` (bump on register/unregister and tag/kind edits).
- [ ] **Lifecycle hooks** — register on spawn/add; unregister on remove, death cull, assembly purge (`tilelabSandbox`, `spawnerConfig`, `spawnAssembly`, `pushablePhysicsPass`, …).
- [ ] **Sim id lookups** — pads, pad effects, button links use registry instead of `findPickupById` / `findLivePickup` scans.
- [ ] **Pads** — same register/unregister pattern once pickups are solid.

## Step 2 — Bounds query cache (first registry consumer)

Generic **bounds + optional filters** — viewport is just a caller passing the visible rect. Demand-built, tick-scoped cache on top of current-tick `EntityGrid`.

- [ ] **`queryView(criteria) → refs[]`** — `{ bounds, kinds?, tags? }`; build on miss, return cached array ref on hit.
- [ ] **Validity key** — `(spatialGen, membershipGen, boundsKey, filterKey)`. `spatialGen` = `SpatialFrameCore.frameId` (positions change every tick). `membershipGen` = entity set/tags changed. Live sim: spatial entries expire each tick; coalesce duplicate asks within the same tick. Paused/static: cache can persist while gens don't advance.
- [ ] **Derived narrow** — e.g. `kind: ball` + same bounds/gens filters a warm superset (`all pickups in bounds`) in memory instead of re-querying spatial.

## Step 3 — Wire sim + render (non-UI)

- [ ] **Renderer** — cull/draw via `queryView({ bounds: viewportRect, … })` instead of full `state.pickups` iteration.
- [ ] **Sim scans** — `populateCombatFrame`, `pushablePhysicsPass`, `dragLaunch`, cue-strike targets: registry `get(id)` or `queryView` where arrays are scanned today.
- [ ] **Camera follow** — `tickSandboxCameraFollow` resolves target by id via registry.
