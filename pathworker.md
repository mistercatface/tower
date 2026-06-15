# Path worker — status & plan

HPA click-to-move on big maps. Goal: replan without main-thread hangs and without blocking the whole editor.

---

## What was actually freezing the game (fixed)

**Not pathfinding.** The Scene sidebar listed **every wall voxel** (`listPlacedVoxelWalls` → full grid scan → one DOM row per cell). Big cavern gen = tens of thousands of rows; every `sync()` wiped `innerHTML` and rebuilt the whole panel → layout thrash / apparent freeze.

**Fix:** Scene list shows **hand-tracked** voxel placements only (`listTrackedVoxelWalls` in `sandboxSession.js`). Bulk cavern/map-gen terrain stays on the grid, not in the Scene list. Export/import unchanged.

---

## Worker refactor — current state

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Stop clearing path on click (sandbox) | **Done** | `markTargetChanged` in `rollToCursorHpaNav.js` — keep steering on old path until replan applies |
| 2 | One-shot worker replan | **Done** | `runOneShotReplan` in `HpaPathWorker.js` — single `replan` IPC per request |
| 3 | Abstract-first + first-leg-only apply | **Done** | Worker posts `abstractReady` (octile temp-cost estimate); main applies region waypoints, then first stitched leg on `hpaDone`, full stitch via `queueMicrotask` |
| 4 | Persistent abstract graph on worker | **Partial** | Worker holds CSR graph in SABs; main still owns `nodesMap` and rebuilds region edges on wall edits |
| 5 | Snapshot off click path | **Partial** | Worker bakes octile nav snapshot; flow grid no longer sync-bakes on obstacle change; click still `await`s nav/graph sync when stale; **main** `rebuildDamagedArea` still sync-bakes on edits |
| 6 | Leg advancement while walking | **Not done** | Full replan every target change; no region-at-a-time follow |

**Net:** Worker moves replan CPU off the main thread. Total replan work is largely unchanged. Click can still feel slow until #3/#6 land — but the game no longer locks up from the Scene panel.

---

## Architecture (today)

```
Click → HpaPathSession._drainReplan (async)
      → computeCellPath + replanCtx.hpaWorker
      → runOneShotReplan: await nav ready → await graph ready → worker replan
            → abstractReady: apply region waypoints (steer immediately)
            → hpaDone: apply first cell leg → queueMicrotask full stitch
      → applyHpaReplanResult / applyHpaAbstractFirst
```

- **Warm click (no wall edits):** no `rebuildDamagedArea`, no flow `buildGridNavSnapshot`, no Scene list grid scan.
- **Wall edit:** `onObstaclesChanged` → region graph surgery on main + worker nav/graph reschedule.

Key files: `HpaPathWorker.js`, `HpaWorkerEntry.js`, `HierarchicalNavigator.js`, `HpaPathSession.js`, `rollToCursorHpaNav.js`, `FlowFieldGrid.js`, `NavigationService.js`.

---

## Still to do (priority order)

1. ~~**Abstract-first apply**~~ — done (#3).
2. **Leg advancement while walking** — replan next region hop when agent enters it, not full path from scratch (#6).
3. **Obstacle edit path** — stop sync `ensureGridNavSnapshot` inside `rebuildDamagedArea` / `_connectRegionPair`; incremental dirty graph sync to worker (#4/#5).
4. **Sidebar render** — stop full `container.innerHTML = ""` rebuild on every `sync()` in `sandboxToyUi.js` (Scene list fix removed the worst case; palette/selected still rebuild wholesale).
5. **Voxel draw batching** — optional; merge collinear voxel faces like rail walls (`mergeCollinearRailWallBoxes`) to cut per-frame drawable count in big caverns.

---

## Non-goals / don't regress

- Scene list must **not** enumerate bulk terrain voxels again.
- No dual nav snapshot pipelines (main sync bake + worker bake) on the hot path once #5 is finished.
- No in-memory migration shims — refresh is the migration.
