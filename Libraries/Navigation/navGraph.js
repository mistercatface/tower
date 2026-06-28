import { cellInRect, colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { floorBeltEntryExitSides, isFloorBeltKind } from "../Spatial/grid/FloorCell.js";
import { boundaryBlocksStepFrom } from "../Spatial/grid/boundaryOccupancy.js";
import { navCanStep } from "../Pathfinding/navTopologySab.js";
import { bakeNavTopologyLocal } from "../Pathfinding/bakeNavTopology.js";
/** @typedef {number} CellIdx */
export function createNavGraphView(grid, baked = null, navTopology = null) {
    const topologyRef = navTopology ?? grid._navTopologyRef;
    const frame = topologyRef?.frame ?? null;
    const topology = topologyRef?.topology ?? null;
    return {
        grid,
        frame,
        topology,
        cardinalOpen: baked?.cardinalOpen ?? null,
        vertexPassability: baked?.vertexPassability ?? null,
        isBlockedIdx(idx) {
            return grid.grid[idx] !== 0;
        },
        floorKindAtIdx(idx) {
            return grid.floorStore.kind[idx];
        },
        floorFacingAtIdx(idx) {
            return grid.floorStore.facing[idx];
        },
        edgeAtIdx(idx, side) {
            return grid.edgeStore.getIdx(idx, side);
        },
        isBeltCellIdx(idx) {
            return isFloorBeltKind(grid.floorStore.kind[idx]);
        },
        beltEntryExitIdx(idx) {
            if (idx < 0 || idx >= grid.cols * grid.rows) return null;
            const kind = grid.floorStore.kind[idx];
            if (!isFloorBeltKind(kind)) return null;
            return floorBeltEntryExitSides(kind, grid.floorStore.facing[idx]);
        },
        beltEntryNeighborIdx(idx) {
            const sides = this.beltEntryExitIdx(idx);
            if (!sides) return -1;
            const cols = grid.cols;
            const side = sides.entrySide;
            if (side === 0) return idx - cols >= 0 ? idx - cols : -1;
            if (side === 1) return (idx % cols) + 1 < cols ? idx + 1 : -1;
            if (side === 2) return idx + cols < cols * grid.rows ? idx + cols : -1;
            if (side === 3) return idx % cols > 0 ? idx - 1 : -1;
            return -1;
        },
        canStepIdx(fromIdx, toIdx) {
            if (this.cardinalOpen && this.vertexPassability) return !boundaryBlocksStepFrom(grid, this.cardinalOpen, this.vertexPassability, fromIdx, toIdx);
            if (frame && topology) return navCanStep(frame, topology, fromIdx, toIdx);
            return false;
        },
    };
}
/**
 * Snap path goal to belt entry using the nav graph (PR3 single read path).
 *
 * @param {ReturnType<typeof createNavGraphView>} graph
 */
export function snapNavGraphGoalCellIdx(graph, fromIdx, targetIdx) {
    const { grid } = graph;
    if (!isFloorBeltKind(grid.floorStore.kind[targetIdx])) return targetIdx;
    const neighborIdx = graph.beltEntryNeighborIdx(targetIdx);
    if (neighborIdx === -1 || grid.grid[neighborIdx] !== 0) return targetIdx;
    if (fromIdx === neighborIdx) return targetIdx;
    return neighborIdx;
}
/** @param {number[]} cellIndices */
export function validateBeltChain(graph, cellIndices) {
    if (cellIndices.length < 2) return { ok: true };
    const { grid } = graph;
    const cols = grid.cols;
    for (let i = 0; i < cellIndices.length - 1; i++) {
        const a = cellIndices[i];
        const b = cellIndices[i + 1];
        const kindA = grid.floorStore.kind[a];
        const facingA = grid.floorStore.facing[a];
        const kindB = grid.floorStore.kind[b];
        const facingB = grid.floorStore.facing[b];
        const { exitSide } = floorBeltEntryExitSides(kindA, facingA);
        const { entrySide } = floorBeltEntryExitSides(kindB, facingB);
        const dc = (b % cols) - (a % cols);
        const dr = ((b / cols) | 0) - ((a / cols) | 0);
        let stepSide = -1;
        if (dc === 1 && dr === 0) stepSide = 1;
        else if (dc === -1 && dr === 0) stepSide = 3;
        else if (dc === 0 && dr === 1) stepSide = 2;
        else if (dc === 0 && dr === -1) stepSide = 0;
        if (stepSide !== exitSide) return { ok: false, reason: `cell ${i} exit ${exitSide} ≠ step ${stepSide} toward ${i + 1}` };
        const reverseSide = stepSide === 1 ? 3 : stepSide === 3 ? 1 : stepSide === 2 ? 0 : 2;
        if (reverseSide !== entrySide) return { ok: false, reason: `cell ${i + 1} entry ${entrySide} ≠ approach ${reverseSide}` };
        if (!graph.canStepIdx(a, b)) return { ok: false, reason: `canStep blocked ${i}→${i + 1}` };
        if (graph.canStepIdx(b, a)) return { ok: false, reason: `reverse canStep open ${i + 1}→${i}` };
    }
    return { ok: true };
}
/** Worker-synced nav topology → graph view (map-gen, vision, belt endpoints). */
export function createNavGraphViewFromTopology(navTopology) {
    return createNavGraphView(navTopology.grid, { cardinalOpen: navTopology.navCardinalOpen, vertexPassability: navTopology.vertexPassability }, navTopology);
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {import("../DataStructures/CellRect.js").CellBounds | null} [damageBounds] */
export function canStepForAuthoringIdx(grid, fromIdx, toIdx, damageBounds = null) {
    return createNavGraphViewWithLocalBake(grid, damageBounds).canStepIdx(fromIdx, toIdx);
}
/** @param {ReturnType<typeof createNavGraphView>} graph @param {number[]} cellIndices */
export function canStepPathIdx(graph, cellIndices) {
    for (let i = 0; i < cellIndices.length - 1; i++) if (!graph.canStepIdx(cellIndices[i], cellIndices[i + 1])) return false;
    return true;
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
export function createNavGraphViewWithLocalBake(grid, damageBounds = null) {
    const baked = bakeNavTopologyLocal(grid, damageBounds);
    return createNavGraphView(grid, { cardinalOpen: baked.cardinalOpen, vertexPassability: baked.vertexPassability }, baked.navTopology);
}
