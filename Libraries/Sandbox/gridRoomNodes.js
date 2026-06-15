import { forEachDenseCellInRect } from "../DataStructures/CellRect.js";
import { cellInRect } from "../Spatial/grid/GridUtils.js";
import { aabbFromTwoPointsInto, createAabb } from "../Math/Aabb2D.js";
import { drawAabbHighlight, getCanvasLineScale } from "../Render/common/viewportUtils.js";
import { findGridAnchoredFloorPropAtCell } from "../Spatial/zones/floorShapes.js";
export const DEFAULT_GRID_ROOM_NODE_COLS = 8;
export const DEFAULT_GRID_ROOM_NODE_ROWS = 8;
/** @param {object} state @returns {{ id: number, col: number, row: number, width: number, height: number }[]} */
export function listGridRoomNodes(state) {
    if (!state.sandboxGridRoomNodes) state.sandboxGridRoomNodes = [];
    if (state.sandboxGridRoomNodeIdCounter == null) state.sandboxGridRoomNodeIdCounter = 0;
    return state.sandboxGridRoomNodes;
}
/** @param {object} state @param {number} col @param {number} row @param {number} width @param {number} height */
function nodeRectContains(node, col, row, width, height) {
    return col >= node.col && col < node.col + node.width && row >= node.row && row < node.row + node.height;
}
/** @param {object} state @param {number} col @param {number} row */
export function gridRoomNodeOccupiesCell(state, col, row) {
    const nodes = listGridRoomNodes(state);
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (col >= node.col && col < node.col + node.width && row >= node.row && row < node.row + node.height) return true;
    }
    return false;
}
/** @param {object} state @param {number} col @param {number} row */
export function gridRoomNodeCellBlocked(state, col, row) {
    const grid = state.obstacleGrid;
    if (!cellInRect(col, row, grid.cols, grid.rows)) return true;
    if (grid.isBlocked(col, row)) return true;
    if (grid.hasFloorOccupancy(col, row)) return true;
    if (findGridAnchoredFloorPropAtCell(state.entityRegistry, col, row)) return true;
    if (gridRoomNodeOccupiesCell(state, col, row)) return true;
    return false;
}
/** @param {object} state @param {number} anchorCol @param {number} anchorRow @param {number} width @param {number} height */
export function canStampGridRoomNodeAt(state, anchorCol, anchorRow, width, height) {
    const grid = state.obstacleGrid;
    const endCol = anchorCol + width - 1;
    const endRow = anchorRow + height - 1;
    if (!cellInRect(anchorCol, anchorRow, grid.cols, grid.rows)) return false;
    if (!cellInRect(endCol, endRow, grid.cols, grid.rows)) return false;
    let clear = true;
    forEachDenseCellInRect(anchorCol, endCol, anchorRow, endRow, grid.cols, (col, row) => {
        if (gridRoomNodeCellBlocked(state, col, row)) clear = false;
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
export function resolveGridRoomNodePlacePreview(state, anchorCol, anchorRow, width, height) {
    const grid = state.obstacleGrid;
    /** @type {{ col: number, row: number, clear: boolean }[]} */
    const cells = [];
    let valid = true;
    for (let dr = 0; dr < height; dr++)
        for (let dc = 0; dc < width; dc++) {
            const col = anchorCol + dc;
            const row = anchorRow + dr;
            const clear = !gridRoomNodeCellBlocked(state, col, row);
            if (!clear) valid = false;
            cells.push({ col, row, clear });
        }
    return { kind: "cellRect", anchorCol, anchorRow, width, height, cells, valid, tint: "node" };
}
/** @param {object} state @param {number} anchorCol @param {number} anchorRow @param {number} width @param {number} height */
export function stampGridRoomNodeAt(state, anchorCol, anchorRow, width, height) {
    if (!canStampGridRoomNodeAt(state, anchorCol, anchorRow, width, height)) return null;
    const node = { id: state.sandboxGridRoomNodeIdCounter++, col: anchorCol, row: anchorRow, width, height };
    listGridRoomNodes(state).push(node);
    return node;
}
const NODE_OUTLINE_BOUNDS = createAabb();
/** @param {CanvasRenderingContext2D} ctx @param {object} state @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
export function drawPlacedGridRoomNodes(ctx, state, grid) {
    const nodes = listGridRoomNodes(state);
    if (!nodes.length) return;
    const lineScale = getCanvasLineScale(ctx);
    const half = grid.cellSize * 0.5;
    ctx.save();
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const c0 = grid.gridToWorld(node.col, node.row);
        const c1 = grid.gridToWorld(node.col + node.width - 1, node.row + node.height - 1);
        drawAabbHighlight(ctx, aabbFromTwoPointsInto(NODE_OUTLINE_BOUNDS, c0.x - half, c0.y - half, c1.x + half, c1.y + half), {
            fill: "rgba(120, 180, 255, 0.08)",
            stroke: "rgba(120, 180, 255, 0.55)",
            lineWidth: lineScale,
            dash: [6, 4],
        });
    }
    ctx.restore();
}
