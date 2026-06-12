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
- [x] **`resolveCueStrikeMaxRayDist` in dragLaunch** — dropped inline grid diagonal math.
- [x] **`findPickupById` / `findLivePickup`** — sandbox pad/link/button lookups (`findPickupAt.js`).
- [x] **`chunkWorldAabb`** — chunk cell iteration in `HorizontalSurfaceDraw` + `staticOccupancyLayers`.
- [x] **`createWallFaceAxes` returns `edgeLen`** — shared wall-edge direction in WorldSurface cluster.
- [x] **`forEachArmedSandboxPickup`** — weapon bars + laser sights share armed-pickup gate.
- [x] **`RenderableRoofCap` bounds** — uses `expandPointsAabbInto` like wall faces.
- [x] **`getCanvasLineScale(ctx)`** — screen-constant stroke/dash/marker sizing in overlay draw paths.
- [x] **`drawProjectedHorizontalChunk`** — perspective `drawImageQuad` blit for elevated horizontal chunks (`WorldSurfaceResolution.js`); roof chunks + assembly patches.

---

## Dedup / helper backlog

Small repeated patterns worth extracting when touching nearby code:

**Sandbox / combat**

- [ ] **`buildCueStrikeCircleTargets` in dragLaunch** — drag aim still builds `{ x, y, radius }[]` inline; cue strike has richer filter (void/sink skip)
- [ ] **`mergeConfig(defaults, ...layers)`** — shallow merge in `getDragLaunchConfig`, `getRollToCursorConfig`, `getSpawnerDragConfig`

**Lifecycle / collections**

- [ ] **Entity id masterlist (`Map<id, entity>`)** — `state.pickups` is array-only today; pad links, button effects, and `findPickupById` linear-scan on every lookup. Maintain a central id→entity index on spawn/remove/death (pickups first; extend to walls/actors if link-by-id spreads). Replace `findPickupById` call sites with map lookup; keep array for iteration order.
- [ ] **`pruneDeadInPlace(arr)`** — reverse-loop splice in `CombatParticles`, `FloatingText`, `explosionRuntime`, `RagdollCorpse`, `pushablePhysicsPass`
- [ ] **`collectVisibleWithDepth(entities, viewport, px, py)`** — duplicate loops in `WorldSceneRenderer` (_appendVisible3dProps / _appendVisibleRagdolls)

**Math / geometry adoption**

- [ ] **Use `Vec2` helpers opportunistically** — `lengthXY`, `distSqXY`, `withinRadiusSq` exist; many sites still hand-roll `Math.hypot` / `(dx)**2`
- [ ] **`findPickupAt` dist check** — could use `distSqXY` + `withinRadiusSq`

**Render / canvas (paused)**

- [ ] See **drawImage / texture backlog** below — `gatherTexturedQuadCells` moved there

**Grid / surfaces**

- [ ] **`forEachObstacleGridCellInChunk(grid, originX, originY, sizePx, fn)`** — thin wrapper over `chunkWorldAabb` + `forEachObstacleGridCellInAabb` if chunk iteration keeps spreading
- [ ] **`isRenderableWall(w)`** — `wall.isDead || wall.collisionOnly` skip in legacy SceneCompiler / HorizontalSurfaceDraw

---

## Canvas / 3D projection audit (2025-06)

Three projection layers exist — intentional, but easy to confuse:

| Layer | Where | Used for |
|-------|--------|----------|
| **Elevation point/rect** | `IsometricProjection.js` — `projectWorldPointInto`, `projectWorldAabbCornersInto` | Roofs, walls, assembly patches, prop mesh verts |
| **Vertical extrusion** | `projectVertical`, `extrudeBox`, `pointOnFrustum`, `traceVisibleArc` | `SolidDraw.js` boxes/cylinders/cones |
| **Affine texture quads** | `drawImageQuad` + `drawTexturedQuadCells` | Wall atlases, sphere decals, inspect labels |

- [x] **`drawSphereTexturePatch`** — scratch cell pool + `projectPropVertexInto` (pool balls hot path).
- [x] **Direct canvas paint helpers** — `strokeCircle`, `fillCircle`, `strokeSegment`, `fillStrokeClosedPolygonTranslated`, etc. in `CanvasPath.js` (no trace→paint closures).
- [x] **`traceArc`** — wrapper for arc segments (assembly guides).
- [x] Migrated **`drawActivePathOverlay`**, **`dragLaunch`**, **`contactPreviewDraw`**, **`rollToCursorMotion`**, **`projectileDraw`**, **`sandboxPadLinks`**, **`sandboxPads`**, **`floorShapes`**, **`pit` interior**, **`labMapCaches`** debug edges.

### Still messy (todo)

**3D props — lower priority**

- [ ] **`drawRadialSilhouetteBody`** (`SolidDraw.js`) — custom arc path; OK to keep, optional named helper

**ctx path — low priority**

- [ ] **`LaserBeam.js`** — intentional double-stroke on one path; leave as-is
- [ ] **`CombatParticles.js`**, **`CylinderInspect`**, editor **`preview.js`** — offscreen/debug; migrate if touched
- [ ] **`ProgressBar.js`**, **`AffineTexture.js`** — internal canvas utilities

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

## drawImage / texture backlog

Most warped textures already go through `drawImageQuad` (`AffineTexture.js`) or `drawBakedTexture` (`WorldSurfaceResolution.js`). These are the remaining gaps — ranked by impact.

**1. ~~`drawProjectedHorizontalChunk`~~** — done; perspective `drawImageQuad` for elevated horizontal chunks.

**2. Textured quad cell GC (perf — hot path)**

- [ ] **`gatherTexturedQuadCells` scratch + in-place sort** — Sphere decals (`drawSphereTexturePatch`) and cylinder inspect build a new `cells` array every draw; `drawTexturedQuadCells` then `[...cells].sort(...)`. Pool the cell list and sort in place (or track max depth index) to cut allocations on pool-ball / prop texture draws.

**3. Inspect label path convergence (consistency)**

- [ ] **BoxInspectLabel → `drawTexturedQuadCells`** — `CylinderInspect` / sphere patches use `gatherTexturedQuadCells` + `drawTexturedQuadCells`; `BoxInspectLabel.js` hand-builds quads, sorts by depth, loops `drawImageQuad` directly. Same engine, two glue styles (`syTop`/`syBot` vs `sy0`/`sy1` naming only). Low priority — inspect-only, not simulation hot path.

**4. Editor map cache blit (cosmetic)**

- [ ] **`drawMapImageCache(ctx, cache)`** — Lab editor repeats `ctx.drawImage(cache.canvas, cache.minX, cache.minY)` (and scaled variants in `mapOverview.js`, `preview.js` wall/path layers). Thin wrapper over `{ canvas, minX, minY, maxX, maxY }` bake caches from `labMapCaches.js`.

**5. Legacy sprite blit audit**

- [ ] **Audit `Entity.renderCachedSprite` callers** — `QuantizedSpriteCache` already has `blitAnchoredSprite` / `blitCenteredSprite` (translate, scale, smoothing, `drawImage`). `Entity.renderCachedSprite` is an older parallel (translate, rotate, centered `drawImage`). Find callers; migrate hot paths to quantized blit helpers and retire or document the legacy path.

**6. Image-smoothing boilerplate (nitpick)**

- [ ] **`withImageSmoothing(ctx, enabled, fn)`** — Save/restore `imageSmoothingEnabled` repeated in `drawBakedTexture`, `drawTexturedQuadCells`, `blitAnchoredSprite`, `ProjectedWallDraw`, `assemblySurfaceDraw`, `BoxInspectLabel`. Tiny helper; low payoff unless touching those files anyway. Related: unify option names — walls use `bleedPx`, textured cells use `screenBleed` (same `drawImageTriangle` opt).

---

## Render / canvas dedup (optional)

- [ ] Migrate **`LaserBeam`**, particles, inspect draw if touched during prop work

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
