import { forEachDenseCellInRect } from "../DataStructures/CellRect.js";
import { cellInRect } from "../Spatial/grid/GridUtils.js";
import { findGridAnchoredFloorPropAtCell } from "../Spatial/zones/floorShapes.js";
import { addRoomNode, roomNodeOccupiesCell } from "./roomGraphStore.js";
export const DEFAULT_ROOM_NODE_COLS = 8;
export const DEFAULT_ROOM_NODE_ROWS = 8;
/** @param {object} state @param {number} col @param {number} row */
export function roomNodeCellBlocked(state, col, row) {
    const grid = state.obstacleGrid;
    if (!cellInRect(col, row, grid.cols, grid.rows)) return true;
    if (grid.isBlocked(col, row)) return true;
    if (grid.hasFloorOccupancy(col, row)) return true;
    if (findGridAnchoredFloorPropAtCell(state.entityRegistry, col, row)) return true;
    if (roomNodeOccupiesCell(state, col, row)) return true;
    return false;
}
/** @param {object} state @param {number} anchorCol @param {number} anchorRow @param {number} width @param {number} height */
export function canStampRoomNodeAt(state, anchorCol, anchorRow, width, height) {
    const grid = state.obstacleGrid;
    const endCol = anchorCol + width - 1;
    const endRow = anchorRow + height - 1;
    if (!cellInRect(anchorCol, anchorRow, grid.cols, grid.rows)) return false;
    if (!cellInRect(endCol, endRow, grid.cols, grid.rows)) return false;
    let clear = true;
    forEachDenseCellInRect(anchorCol, endCol, anchorRow, endRow, grid.cols, (col, row) => {
        if (roomNodeCellBlocked(state, col, row)) clear = false;
    });
    return clear;
}
/**
 * @param {object} state
 * @param {number} anchorCol
 * @param {number} anchorRow
 * @param {number} width
 * @param {number} height
 */
export function resolveRoomNodePlacePreview(state, anchorCol, anchorRow, width, height) {
    /** @type {{ col: number, row: number, clear: boolean }[]} */
    const cells = [];
    let valid = true;
    for (let dr = 0; dr < height; dr++)
        for (let dc = 0; dc < width; dc++) {
            const col = anchorCol + dc;
            const row = anchorRow + dr;
            const clear = !roomNodeCellBlocked(state, col, row);
            if (!clear) valid = false;
            cells.push({ col, row, clear });
        }
    return { kind: "cellRect", anchorCol, anchorRow, width, height, cells, valid, tint: "node" };
}
/** @param {object} state @param {number} anchorCol @param {number} anchorRow @param {number} width @param {number} height @param {string} [kind] @param {string | null} [surfaceProfileId] */
export function stampRoomNodeAt(state, anchorCol, anchorRow, width, height, kind, surfaceProfileId) {
    if (!canStampRoomNodeAt(state, anchorCol, anchorRow, width, height)) return null;
    const spec = { col: anchorCol, row: anchorRow, width, height };
    if (kind) spec.kind = kind;
    if (surfaceProfileId) spec.surfaceProfileId = surfaceProfileId;
    return addRoomNode(state, spec);
}
