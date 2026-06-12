# Bounds / spatial query architecture

Unified world-space boxes around `Aabb2D`, registry query semantics, and typed-array-friendly hot paths. Design direction: **Box4** (min/max interval semantics) over raw **Vec4** (4-wide storage only) — same `Float32Array(4)` / `Int32Array(4)` layout, different ops per frame.

## Done

- [x] **Single world box type** — `Libraries/Math/Aabb2D.js`; re-export via `Libraries/Spatial/bounds.js`.
- [x] **Shared narrowphase** — `entityIntersectsAabb` (+ `AabbEntityHitTest`) in `Aabb2D.js`; used by `EntityRegistry`.
- [x] **Explicit query modes** — `queryView` (spatial broadphase + circle vs AABB, cached) vs `queryInAabbStrict` (full scan + center/circle, no spatial false negatives).
- [x] **Viewport-owned cull bounds** — render cull passes `viewport.boundsVisibleDefault` by ref; `Viewport.intersectsAabb(aabb)`.
- [x] **Zero-alloc hot paths** — module scratch + `*Into` for pick (`PICK_SEARCH_BOUNDS`), marquee, map circle clear, laser visibility, LOS/path corridor, chunk preflight.
- [x] **Numeric query cache** — `aabbHash` + `hashString` / `mixHash4` in `EntityRegistry._queryCache`; verify-on-hit for bounds + filter key.
- [x] **Aabb end-to-end entity broadphase** — `SpatialFrameCore.collectEntitiesInBounds(bounds)` → `EntityGrid.collectInBounds(bounds)` → `SpatialQuery.collectInIndex`.
- [x] **Aabb end-to-end wall broadphase** — `WallSpatialIndex.collectInBounds(bounds)` → `collectInIndex`.
- [x] **Nav segment bounds** — `getSegmentsInBounds(bounds)`, `collectSegmentsInWorldBounds(layout, bounds)`; `PathClearance` uses `corridorAabbInto`.
- [x] **Chunk AABB** — `chunkWorldAabbInto` / `chunkWorldAabbScratch`; `ChunkDrawPass.chunkAabb` built once in `WorldSurfaceEngine`.
- [x] **Dead code / aliases removed** — `BoundsRect`, `viewportVisibleBounds`, `intersectsWorldAabb`, `sandboxMarqueeBounds`, string `boundsKey`, `entityIntersectsCellBounds`, local `lineCorridorAabbInto`, scalar `SpatialQuery.collectInIndexCoords` public API.

## Next (Box4 / grid — deferred)

- [ ] **`Box4f` / `Box4i` math layer** — `Float32Array(4)` / `Int32Array(4)` + layout enum (`MIN_X`, `MIN_Y`, `MAX_X`, `MAX_Y`); `overlap`, `union`, `pad`, `hash` shared by world + grid boxes. Keep **Vec4** name for generic 4-wide storage (colors, etc.); **Box4** = vec4 with min/max interval contract.
- [ ] **Redo `GridCellRect` as min/max** — replace `{ startCol, endCol, startRow, endRow }` with `{ minX, minY, maxX, maxY }` (or `minCol`/`maxCol`) in **grid index frame**; same algebra as `Aabb2D`, explicit frame tag or separate `Box4i` type so grid indices are never confused with world px.
- [ ] **Frame converters** — formalize existing glue: `gridBoxToWorldAabbInto`, `worldAabbToGridBoxInto`, chunk `(origin, size)` → box; fold `cellBoundsToWorldBoundsInto`, `unionGridCellRect`, damage-bounds literals into Box4 API.
- [ ] **Migrate `Aabb2D` object API** — optional thin typedef/view over `Box4f` backing store; keep object literals at public boundaries only where ergonomics need it.
- [ ] **`boundsToCellRect(aabb)`** — accept `Aabb2D` at grid floor instead of four scalars (internal seam only).

## Next (entity registry — related)

- [ ] **Hardening: sync pickups on state load** — registry membership + spatial tags when restoring sim state.
- [ ] **Reduce dual array/registry scans** — `pushablePhysicsPass`, assembly cleanup still iterate `state.worldProps` directly; route through `forEachOfKind` / registry where order semantics allow.

## Design notes (for later discussion)

- **Not mat4** — AABB/box ops are interval algebra; mat3/affine is for transforms (viewport, iso projection) at frame boundaries.
- **Inclusive max** — world and grid boxes both use `<= max`; grid redo is rename + unify ops, not off-by-one change.
- **Scalar seam OK at cell grid** — `forEachInBounds` unpacks to cols/rows once inside indexes; public APIs stay `Aabb2D` / `Box4`.

# Wall height / obstacle grid

**Done** — one combined cell grid: `0` = open, `1–9` = stamp height level, `10` = infiniwall sentinel resolved at read time via `getWallHeight(settings)` / `STAMP_WALL_LEVEL_INFINI`. Segment walls keep height on `Segment.wallHeight`; when `segmentGrid` has segments for a cell, segment entity height wins.

- [x] **Grid model + resolver** — `WorldObstacleGrid.grid` stores levels; `isBlocked` → `!== 0`; `getCellWallHeightLevel`, `resolveCellWallHeightPx` in `Libraries/World/wallGridCells.js`; `wallGridRevision` on grid for draw cache invalidation.
- [x] **Write path** — stamp/edit paths write level into grid directly; removed `staticOccupancyLayers` / `staticOccupancyRevision`.
- [x] **Read path** — `StaticGridWallDraw`, chunk roofs, `WorldSurfaceSystem` use grid resolver; pathfinding treats any non-zero cell as blocked.

## View / camera constants (wall-height related)

Separate from grid storage — projection and defaults should not be re-fetched per wall face.

- [ ] **Hoist view constants per pass** — `cameraHeight` + `ElevationCamera` on `ChunkDrawPass` / `WallDrawContext` once per frame; stop calling `elevationCameraFromViewport` / reading `settings.cameraHeight` deep in wall draw helpers.
- [ ] **Single wall-height px resolver at draw boundary** — one function for draw/bake: cell level → px, segment `.wallHeight`, infiniwall sentinel → settings default; remove scattered `?? getWallHeight(settings)` and `defaultWallHeight` args passed through static grid draw.
- [ ] **Audit `getWallHeight` call sites** — after grid resolver exists, limit `getWallHeight(settings)` to resolver + atlas cache keys + game-definition bootstrap, not per-cell fallbacks.

# WorldProp / state shape cleanup

- [x] **Sandbox/editor fields off `WorldProp`** — `SandboxEntityMetaStore` on `state.sandbox.entityMeta`; behavior, camera, path visual, assembly membership keyed by entity id.
- [ ] **Combat as one owned object** — group `weaponLoadout`, `weaponSlotState`, `turrets`, `turretController`, `isManualShootActive` under a single combat host (e.g. `prop.combat`) instead of loose fields + lazy controller attachment.
- [ ] **Type-specific state structs** — flipper (`_flipper*`), stand tip (`rollAngle`, `isFallen`), rolling (`rollQuat`) should live in per-kind state bags, not coexist as optional fields on every prop.
- [x] **Split sim state from tilelab editor state** — `state.sandbox` (pads, assemblies, meta) vs `state.editor` (canvas, map UI, panel toggles); sandbox host uses `getSimState()` / `getSandbox()`.
- [ ] **Locomotion agent boundary** — replace `initMobileAgent` field graft (`mobile`, `separation`, `desiredX/Y` on the prop) with an explicit locomotion component or contract object so humanoid/roll-to-cursor props aren't hybrid duck-typed bodies.

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
- [ ] **Batch or cache `getStaticCellDamageAlphaAtGrid`** — per-wall call in draw loop; worth caching if many damaged cells are visible.
- [ ] **WHAT IS THIS DOING HERE IT SMELLS:** `...createDefaultRenderPorts({ weaponVisuals: createWeaponVisuals(GUN_ID_TO_VISUAL) })`.
