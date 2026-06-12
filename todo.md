# Parameter soup / library-style refactors

## In progress

- [x] **`ChunkDrawPass`** — per-chunk draw struct + helpers; built inline in `drawGroundChunks`.

## Backlog

### Render — walls

- [x] **`WallDrawContext`** — typedef + inline `wallCtx` object in `WorldSceneRenderer`; `drawProjectedWallFace` is the single draw entry.

### Bake pipeline

- [x] **`BakeRequest`** — typedef + `paintBakeRequest` / `bakeRequestToCanvas` in `WorldSurfacePainter`; editor preview calls `paintPixelArea` directly with a resolved profile.

### Projection

- [x] **`ElevationCamera`** — `{ viewerX, viewerY, cameraHeight, strength }`; `elevationCameraFromViewport` / `elevationCameraFromChunkPass`; projection APIs take `(height, camera)`.

### Other

- [x] **`drawImageQuad` src/dst struct** — `ImageQuadBlit` `{ img, sx0..sy1, d0..d3 }`; textured cells pass `{ ...cell, img }`.
- [ ] **`drawKinematicsFrameToCanvas` bundle** — sprite bake scratch + rig + viewContext.
- [ ] **`NavigationContext`** — `planHpaSteering` / `replanPath` duplicate 11-arg nav infra list.
- [ ] **`getStaticRoofDrawCanvas` / mask bake** — fold `buildStaticRoofMaskCanvas` coords into `ChunkDrawPass` (partially done via `getStaticRoofDrawCanvas(pass, …)`).
