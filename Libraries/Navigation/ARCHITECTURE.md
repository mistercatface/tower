# Navigation architecture

## Two reads over one world

| Layer | Question | API | Data |
|-------|----------|-----|------|
| **Collision** | Is this voxel a solid wall? | `grid.isBlocked` | Voxel grid |
| **Nav topology** | May I step this direction (belts, passages, octile)? | `grid.canStep` → worker arena | `navGridFrame` / `navTopology` |

Walls block collision first; the worker bakes collision + floor direction + edges into topology. Pathfinding steps use `grid.canStep`, not raw voxels.

## Directed goals (belts)

`snapNavGoal.js` — `snapNavGoalCell` (HPA endpoints) and `snapNavGoalWorld` (locomotion steer targets).

## Edits → worker sync

One entry point: **`commitGridNavEdit`** / **`commitGridNavEditUnion`** → `onObstaclesChanged`. Mutations: **`writeNavFloorCell`**, **`setNavEdge`**, **`syncBeltCellToEdges`** in `navGridMutations.js`. One bake input: **`captureNavGridSnapshot`** → **`bakeNavTopologyIntoArena`** (worker + `bakeNavTopologyLocal`).

Logical graph: **`createNavGraphView`** — see `navGraph.md`.

- **Readiness:** `isNavTopologyReady(hpaPathWorker, grid)`

## Locomotion

Off belt: HPA + `driveGroundNav`. On belt: pathfinder yields; floor physics accelerates; replan on exit.
