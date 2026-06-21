import { clampCellBoundsToGrid } from "../DataStructures/CellRect.js";
import { gridFrameFromGrid } from "./GridNavSnapshot.js";
import { createNavSimView } from "./navSimView.js";
import { buildOctileNeighborsFromTopologyRect, buildOctilePredecessorsFromForwardGrid, navTopologyFromArena, expandNavTopologyBakeBounds, recomputeBlockedFromGridFill } from "./navTopologySab.js";
import { recomputeNavCardinalOpenInto, recomputeVertexPassabilityInto } from "../Spatial/grid/vertexPassability.js";
import { NavTopology } from "../Navigation/NavTopology.js";
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
/**
 * Bake nav topology in-process from the live grid (cell + edge snapshot).
 *
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {import("../DataStructures/CellRect.js").CellBounds | null} [damageBounds]
 */
export function bakeNavTopologyLocal(grid, damageBounds = null) {
    const navTopology = NavTopology.bakeLocal(grid, damageBounds);
    return { frame: navTopology.frame, topology: navTopology.topology, simView: null, cardinalOpen: navTopology.navCardinalOpen, vertexPassability: navTopology.vertexPassability, navTopology };
}
/**
 * Capture the worker bake input snapshot from a live grid.
 *
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {import("../DataStructures/CellRect.js").CellBounds | null} [bounds]
 */
export function captureNavGridSnapshot(grid, bounds = null) {
    return NavTopology.packSnapshot(grid, bounds);
}
