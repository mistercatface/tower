import {  edgeNeighborIdx  } from "../Spatial/spatial.js";
import {  FloorBelt  } from "../Spatial/spatial.js";
import {  boundaryBlocksStepFrom  } from "../Spatial/spatial.js";
import {  cellInRect  } from "../Spatial/spatial.js";
import { navCanStep } from "../Pathfinding/navTopologySab.js";
import { bakeNavTopologyLocal } from "./NavTopology.js";
/** @typedef {number} CellIdx */
export function beltEntryNeighborAtIdx(grid, idx) {
    const sides = FloorBelt.getEntryExitAtIdx(grid, idx);
    if (!sides) return -1;
    return edgeNeighborIdx(idx, sides.entrySide, grid.cols, grid.rows);
}
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
        canStepIdx(fromIdx, toIdx) {
            if (topologyRef) return topologyRef.canStep(fromIdx, toIdx);
            if (this.cardinalOpen && this.vertexPassability) return !boundaryBlocksStepFrom(grid, this.cardinalOpen, this.vertexPassability, fromIdx, toIdx);
            return false;
        },
    };
}
/** Snap a path goal cell to the belt entry neighbor (belt-mouth approach). */
export function snapNavGoalCellIndex(grid, fromIdx, targetIdx) {
    if (!FloorBelt.isBelt(grid.floorStore.kind[targetIdx])) return targetIdx;
    const neighborIdx = beltEntryNeighborAtIdx(grid, targetIdx);
    if (neighborIdx === -1 || grid.grid[neighborIdx] !== 0) return targetIdx;
    if (fromIdx === neighborIdx) return targetIdx;
    return neighborIdx;
}
/**
 * Snap a world-space steer/path goal — cell snap when upstream, entry-edge point when targeting a belt cell.
 *
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 */
export function snapNavGoalWorldInto(out, grid, fromX, fromY, targetX, targetY) {
    const cols = grid.cols;
    const rows = grid.rows;
    const fromCol = grid.worldCol(fromX);
    const fromRow = grid.worldRow(fromY);
    const targetCol = grid.worldCol(targetX);
    const targetRow = grid.worldRow(targetY);
    if (targetCol < 0 || targetCol >= cols || targetRow < 0 || targetRow >= rows) {
        out.x = targetX;
        out.y = targetY;
        return out;
    }
    const targetIdx = targetCol + targetRow * cols;
    if (!cellInRect(targetIdx, cols, rows)) {
        out.x = targetX;
        out.y = targetY;
        return out;
    }
    const fromIdx = fromCol + fromRow * cols;
    const snappedIdx = snapNavGoalCellIndex(grid, fromIdx, targetIdx);
    if (snappedIdx !== targetIdx) {
        out.x = grid.gridCenterXByIdx(snappedIdx);
        out.y = grid.gridCenterYByIdx(snappedIdx);
        return out;
    }
    if (!FloorBelt.isBelt(grid.floorStore.kind[targetIdx]) || fromIdx === targetIdx) {
        out.x = targetX;
        out.y = targetY;
        return out;
    }
    const sides = FloorBelt.getEntryExitAtIdx(grid, targetIdx);
    if (!sides) {
        out.x = targetX;
        out.y = targetY;
        return out;
    }
    const pt = FloorBelt.getEntryEdgeWorldPoint(grid, targetIdx, sides.entrySide);
    out.x = pt.x;
    out.y = pt.y;
    return out;
}
export function snapNavGoalWorld(grid, fromX, fromY, targetX, targetY) {
    return snapNavGoalWorldInto({ x: 0, y: 0 }, grid, fromX, fromY, targetX, targetY);
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
        const { exitSide } = FloorBelt.getEntryExitSides(kindA, facingA);
        const { entrySide } = FloorBelt.getEntryExitSides(kindB, facingB);
        const diff = b - a;
        let stepSide = -1;
        if (diff === 1 && (a + 1) % cols !== 0) stepSide = 1;
        else if (diff === -1 && a % cols !== 0) stepSide = 3;
        else if (diff === cols) stepSide = 2;
        else if (diff === -cols) stepSide = 0;
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
