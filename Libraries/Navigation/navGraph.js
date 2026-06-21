import { cellInRect, colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { floorBeltEntryExitSides, floorBeltEntryNeighborCell, isFloorBeltKind } from "../Spatial/grid/FloorCell.js";
import { boundaryBlocksStepFrom } from "../Spatial/grid/boundaryOccupancy.js";
import { navCanStep } from "../Pathfinding/navTopologySab.js";
import { bakeNavTopologyLocal } from "../Pathfinding/bakeNavTopology.js";
/** @typedef {{ col: number, row: number }} NavGraphCell */
/** @typedef {{ col: number, row: number, side: number }} NavGraphEdgeRef */
/** @typedef {{ grid: import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid, navCardinalOpen: Uint8Array, vertexPassability: Uint8Array }} NavTopologyLike */
/**
 * Logical nav graph view over one grid — cell nodes + cardinal step edges.
 * Authoring reads floorStore + edgeStore; pathfinding reads baked arena when present.
 *
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {{ cardinalOpen?: Uint8Array, vertexPassability?: Uint8Array }} [baked]
 * @param {import("./NavTopology.js").NavTopology | null} [navTopology]
 */
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
        isBlocked(col, row) {
            return grid.isBlocked(col, row);
        },
        floorKindAt(col, row) {
            if (!cellInRect(col, row, grid.cols, grid.rows)) return 0;
            return grid.floorStore.kind[colRowToIndex(col, row, grid.cols)];
        },
        floorFacingAt(col, row) {
            if (!cellInRect(col, row, grid.cols, grid.rows)) return 0;
            return grid.floorStore.facing[colRowToIndex(col, row, grid.cols)];
        },
        edgeAt(col, row, side) {
            return grid.edgeStore.get(col, row, side, grid.cols);
        },
        isBeltCell(col, row) {
            if (!cellInRect(col, row, grid.cols, grid.rows)) return false;
            return isFloorBeltKind(grid.floorStore.kind[colRowToIndex(col, row, grid.cols)]);
        },
        beltEntryExit(col, row) {
            if (!cellInRect(col, row, grid.cols, grid.rows)) return null;
            const idx = colRowToIndex(col, row, grid.cols);
            if (!isFloorBeltKind(grid.floorStore.kind[idx])) return null;
            return floorBeltEntryExitSides(grid.floorStore.kind[idx], grid.floorStore.facing[idx]);
        },
        beltEntryNeighbor(col, row) {
            const sides = this.beltEntryExit(col, row);
            if (!sides) return null;
            return floorBeltEntryNeighborCell(col, row, sides.entrySide);
        },
        /** Baked octile step when topology is ready; otherwise cardinal-only authoring check. */
        canStep(fromCol, fromRow, toCol, toRow) {
            if (this.cardinalOpen && this.vertexPassability) return !boundaryBlocksStepFrom(grid, this.cardinalOpen, this.vertexPassability, fromCol, fromRow, toCol, toRow);
            if (frame && topology) return navCanStep(frame, topology, fromCol, fromRow, toCol, toRow);
            return false;
        },
        /** Wrong-way belt entry blocked (upstream of exit). */
        beltBlocksEntry(fromCol, fromRow, toCol, toRow) {
            if (!cellInRect(toCol, toRow, grid.cols, grid.rows)) return false;
            const idx = colRowToIndex(toCol, toRow, grid.cols);
            if (!isFloorBeltKind(grid.floorStore.kind[idx])) return false;
            const { entrySide, exitSide } = floorBeltEntryExitSides(grid.floorStore.kind[idx], grid.floorStore.facing[idx]);
            const dc = fromCol - toCol;
            const dr = fromRow - toRow;
            if (dc === 0 && dr === 0) return false;
            if (dc === 0 && dr !== 0) return (dr > 0 ? 2 : 0) === exitSide && (dr > 0 ? 0 : 2) !== entrySide;
            if (dc !== 0 && dr === 0) return (dc > 0 ? 1 : 3) === exitSide && (dc > 0 ? 3 : 1) !== entrySide;
            const sideX = dc > 0 ? 1 : 3;
            const sideY = dr > 0 ? 2 : 0;
            return sideX === exitSide || sideY === exitSide;
        },
    };
}
/**
 * Snap path goal to belt entry using the nav graph (PR3 single read path).
 *
 * @param {ReturnType<typeof createNavGraphView>} graph
 */
export function snapNavGraphGoalCell(graph, fromCol, fromRow, targetCol, targetRow) {
    const { grid } = graph;
    const idx = colRowToIndex(targetCol, targetRow, grid.cols);
    if (!isFloorBeltKind(grid.floorStore.kind[idx])) return { col: targetCol, row: targetRow };
    const neighbor = graph.beltEntryNeighbor(targetCol, targetRow);
    if (!neighbor || !cellInRect(neighbor.col, neighbor.row, grid.cols, grid.rows)) return { col: targetCol, row: targetRow };
    if (grid.isBlocked(neighbor.col, neighbor.row)) return { col: targetCol, row: targetRow };
    if (fromCol === neighbor.col && fromRow === neighbor.row) return { col: targetCol, row: targetRow };
    return neighbor;
}
/** @param {{ col: number, row: number, kind: number, facingIndex: number }[]} cells */
export function validateBeltChain(graph, cells) {
    if (cells.length < 2) return { ok: true };
    for (let i = 0; i < cells.length - 1; i++) {
        const a = cells[i];
        const b = cells[i + 1];
        const { exitSide } = floorBeltEntryExitSides(a.kind, a.facingIndex);
        const { entrySide } = floorBeltEntryExitSides(b.kind, b.facingIndex);
        const dc = b.col - a.col;
        const dr = b.row - a.row;
        let stepSide = -1;
        if (dc === 1 && dr === 0) stepSide = 1;
        else if (dc === -1 && dr === 0) stepSide = 3;
        else if (dc === 0 && dr === 1) stepSide = 2;
        else if (dc === 0 && dr === -1) stepSide = 0;
        if (stepSide !== exitSide) return { ok: false, reason: `cell ${i} exit ${exitSide} ≠ step ${stepSide} toward ${i + 1}` };
        const reverseSide = stepSide === 1 ? 3 : stepSide === 3 ? 1 : stepSide === 2 ? 0 : 2;
        if (reverseSide !== entrySide) return { ok: false, reason: `cell ${i + 1} entry ${entrySide} ≠ approach ${reverseSide}` };
        if (!graph.canStep(a.col, a.row, b.col, b.row)) return { ok: false, reason: `canStep blocked ${i}→${i + 1}` };
        if (graph.canStep(b.col, b.row, a.col, a.row)) return { ok: false, reason: `reverse canStep open ${i + 1}→${i}` };
    }
    return { ok: true };
}
/** Worker-synced nav topology → graph view (map-gen, vision, belt endpoints). */
export function createNavGraphViewFromTopology(navTopology) {
    return createNavGraphView(navTopology.grid, { cardinalOpen: navTopology.navCardinalOpen, vertexPassability: navTopology.vertexPassability }, navTopology);
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {import("../DataStructures/CellRect.js").CellBounds | null} [damageBounds] */
export function canStepForAuthoring(grid, fromCol, fromRow, toCol, toRow, damageBounds = null) {
    return createNavGraphViewWithLocalBake(grid, damageBounds).canStep(fromCol, fromRow, toCol, toRow);
}
/** @param {ReturnType<typeof createNavGraphView>} graph @param {{ col: number, row: number }[]} cells */
export function canStepPath(graph, cells) {
    for (let i = 0; i < cells.length - 1; i++) {
        const a = cells[i];
        const b = cells[i + 1];
        if (!graph.canStep(a.col, a.row, b.col, b.row)) return false;
    }
    return true;
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
export function createNavGraphViewWithLocalBake(grid, damageBounds = null) {
    const baked = bakeNavTopologyLocal(grid, damageBounds);
    return createNavGraphView(grid, { cardinalOpen: baked.cardinalOpen, vertexPassability: baked.vertexPassability }, baked.navTopology);
}
