import { cellInRect, colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { portalTraverseExitCell } from "../Spatial/grid/portalAccess.js";
import { wakePushableBody } from "../Motion/pushableSleep.js";
import { evaluatePortalStepEntry } from "./portalLinks.js";
const PORTAL_TRAVERSE_COOLDOWN_MS = 50;
/**
 * Instant traverse (v1 inside = 0 ms): move entity to partner exit cell when a cardinal step crosses a valid portal.
 *
 * @param {object} state
 * @param {object} entity
 * @param {{ partner: { col: number, row: number, side: number } }} entry
 * @param {number} fromCol
 * @param {number} fromRow
 * @param {number} toCol
 * @param {number} toRow
 * @returns {boolean}
 */
export function applyPortalTraverse(state, entity, entry, fromCol, fromRow, toCol, toRow) {
    const grid = state.obstacleGrid;
    const { partner } = entry;
    const exit = portalTraverseExitCell(partner.col, partner.row, partner.side, fromCol, fromRow, toCol, toRow);
    if (!cellInRect(exit.col, exit.row, grid.cols, grid.rows) || grid.isBlocked(exit.col, exit.row)) return false;
    const { x, y } = grid.gridToWorld(exit.col, exit.row);
    entity.x = x;
    entity.y = y;
    const exitIdx = colRowToIndex(exit.col, exit.row, grid.cols);
    entity._portalPrevCellIdx = exitIdx;
    entity._gridZonePrevCellIdx = exitIdx;
    entity._portalTraverseUntil = state.gameTime + PORTAL_TRAVERSE_COOLDOWN_MS;
    entity._portalNavDirty = true;
    wakePushableBody(entity);
    return true;
}
/**
 * Detect cardinal cell crossings for pushables and run portal traverse when preconditions pass.
 *
 * @param {object} state
 * @param {import("../Spatial/world/SpatialFrameCore.js").SpatialFrameCore} spatialFrame
 */
export function tickPortalTraverse(state, spatialFrame) {
    const grid = state.obstacleGrid;
    const pushables = spatialFrame._pushables;
    if (!pushables?.length) return;
    const now = state.gameTime;
    let reindex = false;
    for (let i = 0; i < pushables.length; i++) {
        const entity = pushables[i];
        if (entity.isDead) continue;
        const { col, row } = grid.worldToGrid(entity.x, entity.y);
        if (!cellInRect(col, row, grid.cols, grid.rows)) continue;
        const cellIdx = colRowToIndex(col, row, grid.cols);
        const prevIdx = entity._portalPrevCellIdx;
        if (prevIdx == null || prevIdx < 0) {
            entity._portalPrevCellIdx = cellIdx;
            continue;
        }
        if (prevIdx === cellIdx) continue;
        if (entity._portalTraverseUntil != null && now < entity._portalTraverseUntil) continue;
        const prevCol = prevIdx % grid.cols;
        const prevRow = (prevIdx / grid.cols) | 0;
        const entry = evaluatePortalStepEntry(state, grid, prevCol, prevRow, col, row);
        if (entry && applyPortalTraverse(state, entity, entry, prevCol, prevRow, col, row)) {
            reindex = true;
            continue;
        }
        entity._portalPrevCellIdx = cellIdx;
    }
    if (reindex) spatialFrame.reindexPushables(pushables);
}
