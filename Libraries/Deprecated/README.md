# Deprecated

Archived subsystems kept for reference. **Nothing here is imported by active game or editor code.**

When reviving a module, copy or wire it deliberately — do not re-export from production `Libraries/*` barrels.

## Layout

| Path                                         | What it was                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `sharedEdges/`                               | Worker-backed coplanar wall-edge detection; culled interior faces via `wall.sharedEdges[]` |
| `Render/Deprecated/SharedEdgeWorkerEntry.js` | Dedicated worker entry for shared-edge SAB jobs (was multiplexed into tile workers)        |

## Shared edges (disconnected)

Previously: `StructureRenderer.updateSharedEdges(walls)` → geometry SAB → tile worker `rebuildSharedEdges` → flags on segments → `RenderableWallFace.shouldDraw` skipped shared faces.

Removed from active architecture because wall drawing moved to `WorldSceneRenderer` / static grid paths and nothing called `StructureRenderer`.

To restore: configure `SharedEdgeWorkerCoordinator`, call `updateSharedEdges` when walls change, and re-add shared-edge cull in wall face `shouldDraw` (see `shouldCullSharedWallFace` export).
