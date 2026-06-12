# Parameter soup / library-style refactors

## In progress

- [x] **`ChunkDrawPass`** — elevated-chunk draw cluster; `createChunkDrawPass` built once per visible chunk in `drawGroundChunks`. `getStaticRoofDrawCanvas` takes pass. `buildStaticRoofMaskCanvas` still uses raw coords (optional follow-up).

## Backlog

### Render — walls

- [ ] **`WallDrawContext`** — unify `drawFaceTexture` (12 args), `drawStaticGridWallFace` (9), `RenderableWallFace.draw`; extend existing `drawProjectedWallFace` options through the stack.

### Bake pipeline

- [ ] **`BakeRequest`** — `paintPixelArea`, `bakeWallAtlasCanvas`, `bakeResolvedProfile` share `(ctx, w, h, worldX, worldY, seed, options, profile)`; worker + editor + assembly paths.

### Projection

- [ ] **`ElevationCamera`** — `(viewerX, viewerY, cameraHeight, strength/viewport)` repeated in `projectWorldPointInto`, `projectWorldAabbCornersInto`, `computeProjectedFace`.

### Other

- [ ] **`drawImageQuad` src/dst struct** — 11-arg affine blit; high call volume in walls/roofs/textured cells.
- [ ] **`drawKinematicsFrameToCanvas` bundle** — sprite bake scratch + rig + viewContext.
- [ ] **`NavigationContext`** — `planHpaSteering` / `replanPath` duplicate 11-arg nav infra list.
- [ ] **`getStaticRoofDrawCanvas` / mask bake** — fold `buildStaticRoofMaskCanvas` coords into `ChunkDrawPass` (partially done via `getStaticRoofDrawCanvas(pass, …)`).
