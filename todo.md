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
- [ ] **Drop redundant `gridCellToGlobalColRow` in `resolveStaticWallHeightAtCell`** — index static layers directly from local `(col, row)` when possible.
- [ ] **Batch or cache `getStaticCellDamageAlphaAtGrid`** — per-wall call in draw loop; worth caching if many damaged cells are visible.
