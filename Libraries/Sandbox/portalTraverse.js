import { cellInRect, colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { distanceSqToSegment } from "../Spatial/geometry/WallGeometry.js";
import { isPortalEdge } from "../Spatial/grid/CellEdge.js";
import { portalBodyInMouthZone, portalCrossingVectorForEdge, portalHasCrossingIntent, portalMouthAndBackCells, portalTraverseExitCell } from "../Spatial/grid/portalAccess.js";
import { wakePushableBody } from "../Motion/pushableSleep.js";
import { evaluatePortalStepEntry } from "./portalLinks.js";
const PORTAL_TRAVERSE_COOLDOWN_MS = 50;
/**
 * @param {object} state
 * @param {object} entity
 * @param {{ partner: { col: number, row: number, side: number } }} entry
 * @returns {boolean}
 */
export function applyPortalTraverse(state, entity, entry) {
    const grid = state.obstacleGrid;
    const { partner } = entry;
    const exit = portalTraverseExitCell(grid, partner.col, partner.row, partner.side);
    if (!cellInRect(exit.col, exit.row, grid.cols, grid.rows) || grid.isBlocked(exit.col, exit.row)) return false;
    const { x, y } = grid.gridToWorld(exit.col, exit.row);
    entity.x = x;
    entity.y = y;
    const exitIdx = colRowToIndex(exit.col, exit.row, grid.cols);
    entity._gridZonePrevCellIdx = exitIdx;
    entity._portalTraverseUntil = state.gameTime + PORTAL_TRAVERSE_COOLDOWN_MS;
    entity._portalNavDirty = true;
    wakePushableBody(entity);
    return true;
}
/**
 * Portal contact pass — run after motion, before wall resolve.
 *
 * @param {object} state
 * @param {import("../Spatial/world/SpatialFrameCore.js").SpatialFrameCore} spatialFrame
 */
export function tickPortalContacts(state, spatialFrame) {
    const pushables = spatialFrame._pushables;
    const grid = state.obstacleGrid;
    const now = state.gameTime;
    let reindex = false;
    for (let i = 0; i < pushables.length; i++) {
        const entity = pushables[i];
        if (entity.isDead) continue;
        if (entity._portalTraverseUntil != null && now < entity._portalTraverseUntil) continue;
        const bodyRadius = entity.getShape().getBoundingRadius();
        const wallCandidates = spatialFrame.getWallCandidates(entity);
        for (let j = 0; j < wallCandidates.length; j++) {
            const seg = wallCandidates[j];
            if (seg.isDead || !isPortalEdge(seg.passageEdge)) continue;
            const reach = bodyRadius + grid.cellSize * 0.35;
            if (distanceSqToSegment(seg, entity.x, entity.y) > reach * reach) continue;
            const edge = seg.passageEdge;
            const { gridCol, gridRow, gridSide } = seg;
            if (!portalBodyInMouthZone(grid, edge, gridCol, gridRow, gridSide, entity.x, entity.y, bodyRadius)) continue;
            const cross = portalCrossingVectorForEdge(edge, gridCol, gridRow, gridSide);
            if (!portalHasCrossingIntent(cross, entity.vx, entity.vy, entity._frameDispX, entity._frameDispY)) continue;
            const { mouth, back } = portalMouthAndBackCells(gridCol, gridRow, gridSide, edge);
            const entry = evaluatePortalStepEntry(state, grid, mouth.col, mouth.row, back.col, back.row);
            if (!entry) continue;
            if (applyPortalTraverse(state, entity, entry)) {
                reindex = true;
                break;
            }
        }
    }
    if (reindex) spatialFrame.reindexPushables(pushables);
}
