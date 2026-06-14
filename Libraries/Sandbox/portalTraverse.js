import { cellInRect, colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { distanceSqToSegment } from "../Spatial/geometry/WallGeometry.js";
import { isPortalEdge } from "../Spatial/grid/CellEdge.js";
import {
    portalBodyCrossedEntryPlane,
    portalBodyInMouthZone,
    portalCrossingVectorForEdge,
    portalMouthAllowsCrossing,
    portalMouthAndBackCells,
    portalTraverseExitCell,
    portalTraverseExitVector,
} from "../Spatial/grid/portalAccess.js";
import { invalidateWallResolveCache } from "../Motion/WallCollisionResolver.js";
import { quantizeCardinalAngle } from "../Math/Angle.js";
import { wakePushableBody } from "../Motion/pushableSleep.js";
import { evaluatePortalStepEntry } from "./portalLinks.js";
const PORTAL_TRAVERSE_COOLDOWN_MS = 50;
const PORTAL_EXIT_PAD_CELL_FRAC = 0.15;
/** @param {object} entity @param {{ x: number, y: number }} exitOut */
function applyPortalExitMotion(entity, exitOut) {
    const exitSpeed = Math.max(Math.hypot(entity.vx, entity.vy), Math.hypot(entity._frameDispX ?? 0, entity._frameDispY ?? 0));
    if (exitSpeed > 0) {
        entity.vx = exitOut.x * exitSpeed;
        entity.vy = exitOut.y * exitSpeed;
        if (entity.strategy?.rolls) entity.angularVelocity = (exitSpeed / (entity.radius || 8)) * 0.12;
    }
    const exitAngle = Math.atan2(exitOut.y, exitOut.x);
    if (entity.facing != null) entity.facing = entity.strategy?.cardinalFacing ? quantizeCardinalAngle(exitAngle) : exitAngle;
    if (entity.angle != null) entity.angle = exitAngle;
    const steerAgent = entity.mobile ?? entity;
    if ((steerAgent.desiredX ?? 0) ** 2 + (steerAgent.desiredY ?? 0) ** 2 > 0.0001) {
        steerAgent.desiredX = exitOut.x;
        steerAgent.desiredY = exitOut.y;
    }
}
/**
 * @param {object} state
 * @param {object} entity
 * @param {{ partner: { col: number, row: number, side: number } }} entry
 * @returns {boolean}
 */
export function applyPortalTraverse(state, entity, entry) {
    const grid = state.obstacleGrid;
    const { partner } = entry;
    const exitOut = portalTraverseExitVector(grid, partner.col, partner.row, partner.side);
    const exit = portalTraverseExitCell(grid, partner.col, partner.row, partner.side);
    if (!cellInRect(exit.col, exit.row, grid.cols, grid.rows) || grid.isBlocked(exit.col, exit.row)) return false;
    const mouthWorld = grid.gridToWorld(exit.col, exit.row);
    const bodyRadius = entity.getShape().getBoundingRadius();
    const exitDist = bodyRadius + grid.cellSize * PORTAL_EXIT_PAD_CELL_FRAC;
    entity.x = mouthWorld.x + exitOut.x * exitDist;
    entity.y = mouthWorld.y + exitOut.y * exitDist;
    const exitGrid = grid.worldToGrid(entity.x, entity.y);
    entity._gridZonePrevCellIdx = colRowToIndex(exitGrid.col, exitGrid.row, grid.cols);
    applyPortalExitMotion(entity, exitOut);
    delete entity._portalHopTicket;
    delete entity._portalNavActive;
    entity._portalTraverseUntil = state.gameTime + PORTAL_TRAVERSE_COOLDOWN_MS;
    entity._portalNavDirty = true;
    invalidateWallResolveCache(entity);
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
            const { mouth, back } = portalMouthAndBackCells(gridCol, gridRow, gridSide, edge);
            if (!portalMouthAllowsCrossing(entity, mouth.col, mouth.row, cross, entity.vx, entity.vy, entity._frameDispX, entity._frameDispY)) continue;
            if (!portalBodyCrossedEntryPlane(entity.x, entity.y, mouth, back, cross, grid, bodyRadius)) continue;
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
