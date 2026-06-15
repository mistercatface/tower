# Path worker plan

## Part 1 — Pre-worker cleanup

Strip the broken flow leftovers (`rebuildPlayerFlowField` / `syncLocalObstacles`) and collapse the two HPA front-ends (`HpaStrategy.findPath` vs sandbox `rollToCursorHpaNav.computeCellPath`) into one replan function that owns the full contract: cell path, hop-expanded waypoints, abstract nodes, and crossing-grant hooks. The goal is a single main-thread API that both game entities and sandbox roll-to-cursor call before any worker exists.

## Part 2 — Snapshot as the nav contract

Extend `GridNavSnapshot` to bake hop adjacency alongside `blocked` and `octileNeighbors`, then switch HPA local A* on the main thread to read `snapshotCanStep` (and hop tables) instead of live `WorldObstacleGrid`. Region build can stay on the live grid for now; this phase only proves the frozen graph is complete enough for real pathfinding and catches belt/boundary/hop bugs before they move off-thread.

## Part 3 — Worker PR1: heavy A* on a worker

Add `HpaWorkerEntry` with a path-result SharedArrayBuffer and the same ready-slot / `requestId` pattern flow already uses. Main thread keeps building and repairing Voronoi regions; each replan posts the region adjacency list plus snapshot neighbor/hop buffers, and the worker runs `runLocalAStarFlat` and `runAbstractAStar` against those flat structures. No consumer changes yet beyond wiring the worker behind the unified replan from Part 1.

## Part 4 — Worker PR2: async replan for all HPA consumers

`HpaPathSession` owns async replan for every HPA consumer. `requestHpaNavReplan` leases one of **512** worker slots per in-flight replan; superseding requests coalesce on the same `navState` without clearing the last good path. Game (`HpaStrategy` via `NavigationService`) and sandbox (`rollToCursorHpaNav`) both call the same session API on `state.hpaPathSession`.

- **Steer last good path** until `applyHpaReplanResult` — obstacle bumps no longer null `navState.path` while a replan is in flight.
- **`HierarchicalNavigator.computeCellPath`** uses per-slot temp node ids (`__hpa_s_N` / `__hpa_t_N`) so concurrent replans do not corrupt shared region edges; worker A* runs off-thread per leased slot (up to 512 in flight).
- Flow field stays on its own worker (`FlowFieldGrid`); HPA orchestration (temp nodes, stitch) remains main-thread for now.

Future: single-shot `replanHpa` worker job to collapse N round-trips; region-pair bake on worker; target-keyed dedupe before lease.
