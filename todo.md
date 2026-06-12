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

# Grid cell indexing (dense / sparse)

Three frames already coexist — keep them separate:

| Frame | Key | Where |
|-------|-----|--------|
| Dense bounded | `col + row * cols` (`colRowToIndex`) | `WorldObstacleGrid.grid`, pathfinding, `EntityGrid` |
| Sparse unbounded | `packCellKey(col, row)` (`KEY_STRIDE`) | `SharedEdgeSolver`, global cell identity |
| World | `x, y` | physics, rendering, wall geometry |

Hot paths already use flat `idx` internally (`flowFieldBfs`, HPA `node.cells`, `EntityGrid._getCellIndex`). The gap is **warm loops** that recompute the same index 2–3× per cell. **Do not** adopt Vec2 for grid cells — `col`/`row` scalars match existing convention; `Vec2` object helpers allocate and blur the world vs grid frame distinction.

## Entity grid cell on bodies (audit)

- **`_gridTileIdx`** — set on `EntityGrid.insert` from world `(x, y)`; used only for entity broadphase linked lists (`EntityGrid`, `EntityRegistry` fallback for bodies outside the grid). **Not** obstacle-grid col/row; recomputed every insert/reindex, not kept across frames as a nav hint.
- **No cached obstacle-nav `(col, row)` or `idx` on `WorldProp` / mobile agents** — pathfinding calls `worldToGrid(x, y)` at query time (`HierarchicalNavigator`, `FlowFieldGrid`, `NavigationController.updateFlowField`).
- **`gridCol` / `gridRow`** — only on ephemeral objects: static wall collision proxies (`WorldObstacleGrid._borrowStaticWallProxy`) and static wall draw face candidates (`StaticGridWallDraw`); set at collection time for damage lookup, not on sim entities.
- **Storing nav cell on entities is Tier 3** — grid origin can shift (`expandToCoverAabb`); flow field is a sliding window with its own frame. Only worth caching if profiling shows `worldToGrid` hot and invalidation on grid expand/recenter is handled.

## Tier 1 — do next (~1–2 focused passes)

- [x] **`forEachObstacleGridCellInAabb` → `fn(col, row, idx)`** — same `rowOffset + col` pattern as `forEachDenseCellInRect` in `CellRect.js`; backward compatible third arg. File: `Libraries/Spatial/grid/GridCoords.js`.
- [x] **Idx-aware cell reads** (local helpers in `Libraries/World/wallGridCells.js`, not a new type system):
  - `gridValueAtIdx(grid, idx)` — `grid.grid[idx]`
  - `cellIsStaticWallAtIdx(grid, idx, col, row)` — when bounds / `segmentGrid` need col/row
  - `resolveCellWallHeightAtIdx(grid, idx)` — one index, one array read
- [x] **Fix double-index call sites** using the helpers above:
  - `clipChunkToBlockedCells` — `isBlocked` + `colRowToIndex` duplicate (`ChunkDrawPass.js`)
  - `resolveCellWallHeightPx` — calls `cellIsStaticWall` then indexes again (`wallGridCells.js`)
  - `drawStaticWallFootprintDamageOverlays` + `getStaticCellDamageAlphaAtGrid` — both call `cellIsStaticWall` (`ChunkDrawPass.js`, `staticCellDamage.js`)
- [x] **`staticCellHealth` → numeric `packCellKey(globalCol, globalRow)`** — drop `` `${globalCol},${globalRow}` `` string keys. Files: `staticCellDamage.js`, `Apps/Editor/world/mapWorld.js`, `Apps/Editor/world/staticGridWallEdit.js`.

## Tier 2 — profiling gate

- [ ] **`collectStaticGridWallFaceCandidates`** — read `grid.grid[idx]` once per cell; pass height into neighbor edge checks instead of re-resolving per edge (`StaticGridWallDraw.js`).
- [ ] **Full-grid scans as flat loops** — `stampStaticWalls`, `expandToCoverAabb` copy, `FlowFieldGrid.syncLocalObstacles`: `for (idx = 0; idx < size; idx++)` where body is mostly array access.
- [ ] **Route hand-rolled nested rect loops through `forEachDenseCellInRect`** — e.g. `wallGridBake` clear/mark, `segmentGridWalk.collectSegmentsInCellRect`, HPA rect walks (`HierarchicalNavigator`).

## Tier 3 — skip unless a specific bottleneck appears

- Vec2 / `GridCell` object type for grid coordinates
- idx-first public APIs on `WorldObstacleGrid`
- Cached `worldToGrid` / nav cell fields on moving entities across frames
- Merging `packCellKey` with `colRowToIndex` (different domains)

## Design notes

- **Rule of thumb** — `(col, row)` at API boundaries; `idx` once at the top of a rect loop or BFS; stay in `idx` until world geometry is needed (`getCellBounds`, projection).
- **Box4 / `GridCellRect` redo** (above) is bounds algebra, not cell indexing — complementary, not a substitute for Tier 1.

# Wall height / obstacle grid

**Done** — one combined cell grid: `0` = open, `1 … maxWallHeightLevel` = stamp height level (`level * cellSize` px). Cap lives on `WorldSurfaceSettings.maxWallHeightLevel` (default in `worldSurfaceDefaults.js`).

- [x] **Grid model + resolver** — `WorldObstacleGrid.grid` stores levels; `isBlocked` → `!== 0`; `resolveCellWallHeightPx` in `Libraries/World/wallGridCells.js`; `wallGridRevision` on grid for draw cache invalidation.
- [x] **Write path** — stamp/edit paths write level into grid directly; removed `staticOccupancyLayers` / `staticOccupancyRevision`.
- [x] **Read path** — `StaticGridWallDraw`, chunk roofs, `WorldSurfaceSystem` use grid resolver; pathfinding treats any non-zero cell as blocked.

## View / camera constants (wall-height related)

Separate from grid storage — projection and defaults should not be re-fetched per wall face.

- [ ] **Hoist view constants per pass** — `cameraHeight` + `ElevationCamera` on `ChunkDrawPass` / `WallDrawContext` once per frame; stop calling `elevationCameraFromViewport` / reading `settings.cameraHeight` deep in wall draw helpers.
- [ ] **Single wall-height px resolver at draw boundary** — consolidate `resolveCellWallHeightPx` + segment `.wallHeight ?? settings.wallHeight` at draw/bake entry; drop redundant `defaultWallHeight` threading through static grid draw cache.

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
- [ ] **Batch or cache `getStaticCellDamageAlphaAtGrid`** — per-wall call in draw loop; Tier 1 idx-aware reads reduce duplicate work first; full cache only if many damaged cells visible (see Grid cell indexing).
- [ ] **WHAT IS THIS DOING HERE IT SMELLS:** `...createDefaultRenderPorts({ weaponVisuals: createWeaponVisuals(GUN_ID_TO_VISUAL) })`.
