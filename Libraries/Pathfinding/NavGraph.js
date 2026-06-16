// NavGraph contract + grid layer glossary.
// WorldObstacleGrid implements this shape; Pathfinding reads it, never Sandbox.
//
// ── Layers (inside → out) ─────────────────────────────────────────────────────
//
// Cell — one grid[] slot (col, row). 0 = open; >0 = static voxel fill height level.
//   Queries: cellIsStaticWall, resolveCellWallHeightAtIdx, isBlocked
//   Owner: gridCellTopology.js, WorldObstacleGrid
//
// Edge — data on one side of a cell (side 0=N, 1=E, 2=S, 3=W) in CellEdgeStore.
//   Kinds: railWall, beltRail, forcefield (incl. portal mode). Stored per (col, row, side).
//   Queries: railWallEdgeAt, portalEdgeAt, edgeAt, forEachCellEdge
//   Owner: gridCellTopology.js (read), CellEdge.js (types), CellEdgeStore.js (write)
//
// Boundary — crossing policy over a shared edge (can this step cross this side?).
//   Distinct from edge *kind*: a portal edge + powered/one-way rules = boundary decision.
//   Queries: boundaryBlocksStep, boundaryBlocksStepFrom, setBoundary / clearBoundaryPrimary
//   Owner: boundaryOccupancy.js
//
// Vertex — grid corner (vx, vy); diagonal passability via half-edge bitmask cache.
//   Queries: diagonalBoundaryBlockedFromVertexCache
//   Owner: vertexPassability.js
//
// Hop — abstract jump across a boundary (portals today): mouth cell → exit cell in one nav step.
//   Data: hop CSR in worker nav snapshot SAB (baked from packed passage-network policy)
//   Owner: navSimHopBake.js (worker bake), boundaryNavHops.js (geometry + worker hop build helper)
//
// Bake — 3D presentation derived from cell fill + edges (faces, rail boxes, chunk Z probes).
//   Not part of NavGraph; Render / WorldSurface only.
//   Queries: resolveVoxelWallFace, collectVoxelWallFacesInAabb, resolveRailWallBox, collectRailWallBoxesInAabb
//   Owner: World/wallGridBake.js
//
// Stamp — voxel fill grid[] + edge rails (nav/collision, editor caverns, sandbox paint).
//   Owner: Spatial/grid/wallGridBake.js (distinct from World/wallGridBake.js)
//
// ── Parameters ────────────────────────────────────────────────────────────────
//
// side — cardinal index 0=N, 1=E, 2=S, 3=W on the owning cell.
//
// col, row — cell indices in the obstacle grid's local frame (not global world cells).
//   cellToGlobalColRow / canonicalEdgeCellKey when a stable cross-chunk id is needed.
//
// ── Z levels (world px height) ────────────────────────────────────────────────
//
// collectStaticFillZLevels() — unique tops from grid[] voxel fill only (horizontal roofs).
// collectStaticStructureZLevels() — fill tops + edge-rail tops (all static horizontal layers).
// Both cached on WorldObstacleGrid.wallGridRevision.
//
// ── Module map ────────────────────────────────────────────────────────────────
//
// gridCellTopology.js — cell + edge reads, canonical edge keys, collision emit rules
// boundaryOccupancy.js  — boundary write/read, passage + belt reconciliation
// portalAccess.js       — portal mouth/back/traverse geometry (not hop policy)
// portalSlotIndex.js    — canonical portal edge key → slot lookup
// vertexPassability.js  — vertex cache (worker rebakes from nav sim SABs)
// boundaryNavHops.js    — worker hop build helper, path hop detection, overlay geometry
// boundaryNavSync.js      — invalidate main-thread nav snapshot on portal hop edits
// hpaPathPlan.js        — unified HPA replan: computeCellPath → hop-expanded world path
// GridNavSnapshot.js    — frozen walkability, octile neighbors, hop CSR; localNavView for A*
//
// @typedef {object} NavGraph
// @property {number} cols
// @property {number} rows
// @property {number} cellSize
// @property {number} cellHalfSize
// @property {number} minX
// @property {number} minY
// @property {Uint8Array} grid — 0 = open floor, >0 = static wall height level
// @property {(x: number, y: number) => { col: number, row: number }} worldToGrid
// @property {(col: number, row: number) => { x: number, y: number }} gridToWorld
// @property {(col: number, row: number) => boolean} isBlocked
// @property {(currCol: number, currRow: number, nextCol: number, nextRow: number) => boolean} canStep
//
// @typedef {NavGraph & {
//   gridNavSnapshot?: import("./GridNavSnapshot.js").GridNavSnapshot | null,
//   forEachNavHop?: (col: number, row: number, fn: (exitCol: number, exitRow: number, cost: number) => void) => void,
// }} HopNavGraph
//
