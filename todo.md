# Tower — backlog

Living notes from the static-grid / render-path refactor. Not a release checklist.

---

## Recently done

- [x] **Static stamp = only 3D wall render path** — `StaticGridWallDraw` in radial mode; entity `RenderableWallFace` no longer drawn.
- [x] **Sandbox walls = collision only** — `addSandboxWalls` forces `collisionOnly`; no `SceneCompiler.compileWall`.
- [x] **Pull-pad `wallMode` barriers** — collision-only segments (no 3D compile).
- [x] **Roofs from static stamps only** — `drawRoofs` uses `staticOccupancyLayers`; entity wall roof indexing removed.
- [x] **Shared-edge solve disconnected** — `StructureRenderer.updateSharedEdges` no longer called from `WorldSceneRenderer`.
- [x] **`drawProjectedWallFace`** — unified wall-face draw in `ProjectedWallDraw.js`; static grid + `RenderableWallFace` are thin callers.
- [x] **`appendProjectedFace`** — split from `traceProjectedFace`; damage overlays use append-only inside `withClip`.
- [x] **`projectHorizontalSurfaceCornersInto`** — scratch quad for roof chunk draw + static roof damage (no per-frame corner allocations on hot paths).
- [x] **`projectWorldPointInto` / `projectWorldAabbCornersInto`** — single elevation projection primitive in `IsometricProjection.js`.
- [x] **Prop mesh projection** — `projectPropVertexInto` + scratch verts in `drawPropMeshFace` (no `.map()` per face).
- [x] **`traceClosedPolygonCount`** — prefix-length polygon trace for scratch vertex buffers.
- [x] **Assembly elevated patches** — `projectWorldAabbCornersInto` instead of four allocating `projectWorldPointAtHeight` calls.

---

## Canvas / 3D projection audit (2025-06)

Three projection layers exist — intentional, but easy to confuse:

| Layer | Where | Used for |
|-------|--------|----------|
| **Elevation point/rect** | `IsometricProjection.js` — `projectWorldPointInto`, `projectWorldAabbCornersInto` | Roofs, walls, assembly patches, prop mesh verts |
| **Vertical extrusion** | `projectVertical`, `extrudeBox`, `pointOnFrustum`, `traceVisibleArc` | `SolidDraw.js` boxes/cylinders/cones |
| **Affine texture quads** | `drawImageQuad` + `drawTexturedQuadCells` | Wall atlases, sphere decals, inspect labels |

### Still messy (todo)

**3D props — high impact**

- [ ] **`drawSphereTexturePatch`** — `projectSphereCell` still allocates 4 points × N cells per draw; needs scratch + `projectPropVertexInto` (pool balls hot path)
- [ ] **`drawRadialSilhouetteBody`** (`SolidDraw.js`) — custom arc path; OK to keep, but could wrap `traceVisibleArc` sequence in a named helper
- [ ] **`drawCullFace` / plank lines** — small raw `beginPath` blocks; low priority

**ctx path — migrated vs raw**

| Status | Files |
|--------|--------|
| Uses `CanvasPath` | walls, static grid, pits, pads (partial), `SolidDraw` (partial), damage overlays |
| Raw `ctx.beginPath` still fine | `ProgressBar`, editor preview, label bake canvases (offscreen), `AffineTexture` internals |
| Worth migrating | `drawActivePathOverlay.js` (10×), `dragLaunch.js` (7×), `labMapCaches.js` (4×), `sandboxPads.js` guides |

**Dead / low-use**

- `RenderableRoofCap.draw` — entity roof clip path; static roofs use chunk draw instead
- `projectWorldPointAtHeight` / `projectPropVertex` — allocating wrappers; prefer `*Into` at hot sites

---

## Cleanup — dead code (safe to delete when bored)

These are **orphaned** after the render-path split. Nothing in the live path calls them anymore.

### Shared-edge worker

- [ ] Delete `Libraries/Render/Structure3D/StructureRenderer.js`
- [ ] Delete `Libraries/Render/Structure3D/SharedEdgeBridge.js`
- [ ] Delete `Libraries/Spatial/structure/SharedEdgeSolver.js`
- [ ] Remove from `Libraries/WorldSurface/TileWorkerCoordinator.js`:
  - `wallSharedEdgesSab` / `wallSharedEdgesView`
  - `requestSharedEdges()`
  - `initSharedEdgesSAB` postMessage on worker boot
- [ ] Remove from `Render/WorldSurface/TileWorkerEntry.js`:
  - `initSharedEdgesSAB` handler
  - `rebuildSharedEdges` handler + `SharedEdgeSolver` import

### Entity 3D wall compile / draw (unused)

- [ ] Delete or gut `Libraries/Render/Scene/SceneCompiler.js` (`compileWall` / `compileWalls`)
- [ ] Remove `RenderableWallFace` / `RenderableRoofCap` from live draw path (or delete if `RenderScene` wall pass is unused entirely)
- [ ] Remove `Render/game/wallSurfaceInvalidation.js` if only served entity wall edge memo
- [ ] Trim `Libraries/Render/Scene/Renderables.js` — `sharedEdges` checks on wall faces
- [ ] Drop unused `invalidateRoofs()` no-op in `WorldSurfaceSystem` once all callers are gone
- [ ] Update stale comment in `Libraries/WorldSurface/stampWallHeight.js` (still mentions `compileWall`)

### Sandbox collision still uses `Segment` (keep for now)

Not dead — assemblies and pull pads still spawn `Segment` for grid occupancy + physics. Only the **3D render** path was removed.

- [ ] Later: optional migration of sandbox barriers to dynamic static occupancy patches (no `Segment` entities)
- [ ] Later: simplify `cellIsStaticBlocked` once nothing writes `segmentGrid` for render gating

---

## Static grid / map editor

- [x] CA cavern stamp → `staticOccupancyLayers` + 3D static faces
- [x] Static cell damage (`damageStaticGridCell`)
- [ ] Replace-region stamp (non-additive overwrite of a layer region) — low priority
- [ ] Layer prune / compaction for old `staticOccupancyLayers`
- [ ] HPA* debug overlay polish — deprioritized

---

## Render / canvas dedup (optional)

- [ ] **`drawSphereTexturePatch`** scratch projection (see audit above)
- [ ] Migrate `drawActivePathOverlay.js`, `dragLaunch.js` to `CanvasPath` where paths repeat
- [ ] More `CanvasPath` clip migrations if any stragglers remain

---

## Deferred — rotated / arc map walls

Old generator strategies lived in git commit `9585717` (`Generator/Strategies.js`). Do **not** revive entity 3D walls for maps.

When wanted again, pick one:

- [ ] **Rasterize to grid** — arcs/diamonds → occupancy bitmap → static stamp (single render path), or
- [ ] **Entity collision only** — like sandbox tables (no 3D compile)

---

## Explicitly out of scope (for now)

- Physics Walls debug overlay
- Explosions on static grid (beyond existing `damageStaticGridCell`)
- Static wall face chunking refinements
- 2D static roofs at stamp height in radial mode
