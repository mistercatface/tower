# Nav graph (logical incidence model)

PR3 read API over the unified nav source (PR1–2). One mental model for authoring, debugging, and pathfinding prep.

## Layers

| Layer | Role | API |
|-------|------|-----|
| **Authoring** | Voxels + floor cells + edges | `WorldObstacleGrid`, `writeNavFloorCell`, `setNavEdge`, `syncBeltCellToEdges` |
| **Snapshot** | Worker bake input | `captureNavGridSnapshot` → `{ gridFill, floorKind, floorFacing, edgeSlots, edgePool }` |
| **Bake** | Topology arena | `bakeNavTopologyLocal` / worker `bakeNavTopologyIntoArena` |
| **Logical graph** | Cell nodes + directed steps | `createNavGraphView` |
| **Pathfinding** | Octile CSR | `grid.canStep` → `navCanStep` on baked arena |

Collision (voxel blocked) and topology (directed steps, belt entry, edges) stay separate at bake time but share one snapshot.

## Cell nodes

Each grid cell is a node:

- **Blocked** — voxel fill (`gridFill !== 0`)
- **Floor** — belt kind + facing index (`floorStore`)
- **Derived belt rails** — lateral `beltRail` edges synced only via `syncBeltCellToEdges` (never stamped manually)

## Cardinal edges

Steps between adjacent cells are derived at bake:

1. Destination not blocked
2. Belt entry rules (`beltBlocksEntry`)
3. Boundary edges (rail wall, belt rail, powered passage)
4. Vertex passability for diagonals

`createNavGraphView.canStep` uses the baked octile CSR when `navGridFrame` + `navTopology` are set; map-gen can pass `cardinalOpen` + `vertexPassability` from a local bake for lighter queries.

## Belt flow

- **Entry / exit** — `floorBeltEntryExitSides(kind, facingIndex)`
- **Goal snap** — `snapNavGraphGoalCell` / `snapNavGoalCell` (wraps graph)
- **Chain validation** — `validateBeltChain` — exit→entry alignment + one-way `canStep`

Locomotion on belts: pathfinder owns direction along the chain; physics applies alignment/damping only (future).

## Mutations (PR2)

All nav-affecting edits go through:

- `writeNavFloorCell` — floor + auto `syncBeltCellToEdges` for railed kinds
- `setNavEdge` — primary boundaries (rail wall, forcefield)
- `commitGridNavEdit` / `commitGridNavEditUnion` — one worker resync

Room graph bake, editor stamps, and snake map-gen call the same floor/edge helpers; no third belt-rail authoring path.

- `createNavGraphViewFromContext(gridNavContext)` — worker-synced reads for map-gen / vision
- `canStepForAuthoring(grid, …, damageBounds?)` — local bake for batch authoring
- `canStepPath(graph, cells)` — chain walk check

## Tests

- `tests/navGraphBeltChain.test.js` — belt rails, wrong-way, snap, full commit+bake path
- `tests/navTopologyParity.test.js` — local bake ≡ worker `canStep`
