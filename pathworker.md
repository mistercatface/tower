# Path worker plan

## Part 1 — Pre-worker cleanup

Strip the broken flow leftovers (`rebuildPlayerFlowField` / `syncLocalObstacles`) and collapse the two HPA front-ends (`HpaStrategy.findPath` vs sandbox `rollToCursorHpaNav.computeCellPath`) into one replan function that owns the full contract: cell path, hop-expanded waypoints, abstract nodes, and crossing-grant hooks. The goal is a single main-thread API that both game entities and sandbox roll-to-cursor call before any worker exists.

## Part 2 — Snapshot as the nav contract

Extend `GridNavSnapshot` to bake hop adjacency alongside `blocked` and `octileNeighbors`, then switch HPA local A* on the main thread to read `snapshotCanStep` (and hop tables) instead of live `WorldObstacleGrid`. Region build can stay on the live grid for now; this phase only proves the frozen graph is complete enough for real pathfinding and catches belt/boundary/hop bugs before they move off-thread.

## Part 3 — Worker PR1: heavy A* on a worker

Add `HpaWorkerEntry` with a path-result SharedArrayBuffer and the same ready-slot / `requestId` pattern flow already uses. Main thread keeps building and repairing Voronoi regions; each replan posts the region adjacency list plus snapshot neighbor/hop buffers, and the worker runs `runLocalAStarFlat` and `runAbstractAStar` against those flat structures. No consumer changes yet beyond wiring the worker behind the unified replan from Part 1.

## Part 4 — Worker PR2: async replan for all HPA consumers

Fold game `HpaStrategy` and sandbox `rollToCursorHpaNav` onto one async replan controller that mirrors `FlowFieldGrid.getReadyFlowField` — request on target change, idle until `pathDone`, never steer from an in-flight buffer. Game entities and sandbox HPA mode share the same path session, overlay, and hop/crossing-grant behavior; flow stays a separate short-range consumer on its own worker.
