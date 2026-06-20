import { clampCellBoundsToGrid } from "../DataStructures/CellRect.js";
import { gridFrameFromGrid } from "./GridNavSnapshot.js";
import { createNavSimView } from "./navSimView.js";
import {
    buildOctileNeighborsFromTopologyRect,
    buildOctilePredecessorsFromForwardGrid,
    createNavTopologySabArena,
    expandNavTopologyBakeBounds,
    navTopologyFromArena,
    packNavTopologyFromGrid,
    recomputeBlockedFromGridFill,
} from "./navTopologySab.js";
import { recomputeNavCardinalOpenInto, recomputeVertexPassabilityInto } from "../Spatial/grid/vertexPassability.js";
/**
 * One bake pass: blocked → vertex → cardinal → octile → predecessors.
 * Shared by the HPA worker and in-process authoring/tests.
 *
 * @param {ReturnType<typeof createNavSimView>} simView
 * @param {import("./navTopologySab.js").NavTopology & { octilePredecessors?: Int32Array }} topology
 * @param {Uint8Array} cardinalOpen
 * @param {Uint8Array} vertexPassability
 * @param {import("../DataStructures/CellRect.js").CellBounds | null} damageBounds
 */
export function bakeNavTopologyIntoArena(simView, topology, cardinalOpen, vertexPassability, damageBounds = null) {
    const frame = simView.frame;
    const { cols, rows } = frame;
    const copyBounds = damageBounds ? clampCellBoundsToGrid(damageBounds, cols, rows) : null;
    const bakeBounds = copyBounds ? expandNavTopologyBakeBounds(copyBounds, cols, rows) : null;
    recomputeBlockedFromGridFill(simView.grid, topology.blocked, cols, copyBounds);
    recomputeVertexPassabilityInto(simView, vertexPassability, bakeBounds);
    recomputeNavCardinalOpenInto(simView, cardinalOpen, vertexPassability, bakeBounds);
    const octCol0 = bakeBounds ? bakeBounds.startCol : 0;
    const octCol1 = bakeBounds ? bakeBounds.endCol : cols - 1;
    const octRow0 = bakeBounds ? bakeBounds.startRow : 0;
    const octRow1 = bakeBounds ? bakeBounds.endRow : rows - 1;
    buildOctileNeighborsFromTopologyRect(topology.blocked, cardinalOpen, vertexPassability, cols, rows, topology.octileNeighbors, octCol0, octCol1, octRow0, octRow1);
    if (topology.octilePredecessors) buildOctilePredecessorsFromForwardGrid(topology.octileNeighbors, topology.octilePredecessors, cols, rows, bakeBounds);
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
function ensureLocalNavBakeArena(grid) {
    const cellCount = grid.cols * grid.rows;
    const vertCount = (grid.cols + 1) * (grid.rows + 1);
    if (!grid._localNavBakeArena || grid._localNavBakeArena.cellCount !== cellCount) {
        grid._localNavBakeArena = createNavTopologySabArena(cellCount, vertCount);
        grid._localNavBakeFrame = null;
    }
    return grid._localNavBakeArena;
}
/**
 * Bake nav topology in-process from the live grid (cell + edge snapshot).
 * Sets grid.navGridFrame / grid.navTopology for grid.canStep without a worker round-trip.
 *
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {import("../DataStructures/CellRect.js").CellBounds | null} [damageBounds]
 */
export function bakeNavTopologyLocal(grid, damageBounds = null) {
    const arena = ensureLocalNavBakeArena(grid);
    packNavTopologyFromGrid(grid, arena, damageBounds);
    const frame = gridFrameFromGrid(grid);
    grid._localNavBakeFrame = frame;
    const simView = createNavSimView(frame, arena.gridFill, arena.floorKind, arena.floorFacing, arena.edgeSlots, grid.edgeStore.pool, grid.edgeStore.passageEdgeCount, arena.vertexPassability);
    const topology = navTopologyFromArena(arena);
    topology.octilePredecessors = arena.octilePredecessors;
    bakeNavTopologyIntoArena(simView, topology, arena.cardinalOpen, arena.vertexPassability, damageBounds);
    grid.navGridFrame = frame;
    grid.navTopology = topology;
    return { frame, topology, simView, cardinalOpen: arena.cardinalOpen, vertexPassability: arena.vertexPassability };
}
/**
 * Capture the worker bake input snapshot from a live grid.
 *
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {import("../DataStructures/CellRect.js").CellBounds | null} [bounds]
 */
export function captureNavGridSnapshot(grid, bounds = null) {
    const arena = ensureLocalNavBakeArena(grid);
    packNavTopologyFromGrid(grid, arena, bounds);
    return {
        gridFill: arena.gridFill,
        floorKind: arena.floorKind,
        floorFacing: arena.floorFacing,
        edgeSlots: arena.edgeSlots,
        edgePool: grid.edgeStore.pool,
        passageEdgeCount: grid.edgeStore.passageEdgeCount,
    };
}
