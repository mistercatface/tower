# Deprecated

Archived subsystems kept for reference. **Nothing here is imported by active game or editor code.**

When reviving a module, copy or wire it deliberately — do not re-export from production `Libraries/*` barrels.

## Layout

| Path                                         | What it was                                                                                                  | Reapply when…                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `sharedEdges/`                               | Worker-backed coplanar wall-edge detection; culled interior faces via `wall.sharedEdges[]`                   | You want interior face culling on sim-wall segments again                                              |
| `sceneCompiler/`                             | Retained `RenderScene` + `SceneCompiler` for sim-wall faces/roofs; chunk roof clip + segment damage overlays | You want compile-once wall geometry in a spatial scene graph instead of per-frame `WorldSceneRenderer` |
| `canvasInput/`                               | Unified `CanvasInputController` (pointer + wheel + pinch + keyboard)                                         | You want one input owner instead of ad-hoc `canvasPointer` bindings                                    |
| `LosShadow/`                                 | Camera-centered LOS darkness mask + wall shadow wedges (superseded by active `Libraries/Render/losShadow/`) | Reference only — use active module                                                                     |
| `Render/Deprecated/SharedEdgeWorkerEntry.js` | Worker entry for shared-edge SAB jobs                                                                        | Reviving `sharedEdges/`                                                                                |

## Shared edges

Previously: `StructureRenderer.updateSharedEdges(walls)` → geometry SAB → worker `rebuildSharedEdges` → flags on segments → wall face cull.

Superseded by `WorldSceneRenderer` / static grid paths.

## Scene compiler

Previously: `SceneCompiler.compileWalls(state, renderScene)` → `RenderableWallFace` / `RenderableRoofCap` in chunked `RenderScene` → `clipChunkToRoofFootprints` during elevated chunk draw.

Superseded by static-grid chunk roofs (`staticRoofDraw: true`) and immediate-mode wall draw.

To restore: compile walls into `RenderScene`, pass `renderScene` into chunk draw, use `clipChunkToRoofFootprints` / `drawRoofSegmentDamageOverlays` from this folder (not active `ChunkDrawPass`).

## Canvas input

Drop-in controller that composes wheel zoom, pinch, double-tap detection, pointer bindings, and key bindings. Active code uses `Libraries/Input/canvasPointer.js` directly.
