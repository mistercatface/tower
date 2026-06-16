import { cellInRect, colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { PASSAGE_MODE } from "../Spatial/grid/CellEdge.js";
import {
    portalBodyCrossedEntryPlane,
    portalBodyInMouthZone,
    portalCrossingVectorForEdge,
    portalEdgeBlocksCollision,
    portalMouthAndBackCells,
    portalTraverseExitCell,
    portalTraverseExitVector,
} from "../Spatial/grid/portalAccess.js";
import { crossingGrantAllows, clearCrossingGrantOnEntity } from "../Pathfinding/crossingGrant.js";
import { registerPassageWallContactHandler } from "../Spatial/grid/passageWallContact.js";
import { invalidateWallResolveCache } from "../Motion/WallCollisionResolver.js";
import { quantizeCardinalAngle } from "../Math/Angle.js";
import { wakePushableBody } from "../Motion/pushableSleep.js";
import { passageNetworkPolicyFromGrid } from "../Pathfinding/navPassagePolicySab.js";
import { evaluatePortalHopEntry } from "./portalLinks.js";
import { registerPortalPassageStepHandler } from "./portalStep.js";
const PORTAL_TRAVERSE_COOLDOWN_MS = 50;
const PORTAL_REJECT_COOLDOWN_MS = 16;
const PORTAL_EXIT_PAD_CELL_FRAC = 0.15;
const PORTAL_REJECT_NUDGE_CELL_FRAC = 0.12;
/** Push back toward the mouth side when intake evaluated but traverse did not commit. */
function rejectPortalIntake(entity, cross, grid, gameTime) {
    const bodyRadius = entity.getShape().getBoundingRadius();
    const dist = bodyRadius + grid.cellSize * PORTAL_REJECT_NUDGE_CELL_FRAC;
    entity.x -= cross.x * dist;
    entity.y -= cross.y * dist;
    entity._boundaryTraverseUntil = gameTime + PORTAL_REJECT_COOLDOWN_MS;
    invalidateWallResolveCache(entity);
    wakePushableBody(entity);
}
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
    clearCrossingGrantOnEntity(entity);
    entity._boundaryTraverseUntil = state.gameTime + PORTAL_TRAVERSE_COOLDOWN_MS;
    entity._navPathStale = true;
    invalidateWallResolveCache(entity);
    wakePushableBody(entity);
    return true;
}
/**
 * @param {object} state
 * @param {object} entity
 * @param {object} segment
 */
function assemblePortalIntakeContext(state, entity, segment) {
    if (entity.isDead) return null;
    const now = state.gameTime;
    if (entity._boundaryTraverseUntil != null && now < entity._boundaryTraverseUntil) return null;
    if (segment.isDead) return null;
    const grid = state.obstacleGrid;
    const edge = segment.passageEdge;
    const { gridCol, gridRow, gridSide } = segment;
    const bodyRadius = entity.getShape().getBoundingRadius();
    if (!portalBodyInMouthZone(grid, edge, gridCol, gridRow, gridSide, entity.x, entity.y, bodyRadius)) return null;
    const cross = portalCrossingVectorForEdge(edge, gridCol, gridRow, gridSide);
    const { mouth, back } = portalMouthAndBackCells(gridCol, gridRow, gridSide, edge);
    if (!crossingGrantAllows(entity, mouth.col, mouth.row, cross, entity.vx, entity.vy, entity._frameDispX, entity._frameDispY)) return null;
    if (!portalBodyCrossedEntryPlane(entity.x, entity.y, mouth, back, cross, grid, bodyRadius)) return null;
    const entry = evaluatePortalHopEntry(grid, mouth.col, mouth.row, back.col, back.row, passageNetworkPolicyFromGrid(grid));
    if (!entry) return null;
    return { grid, cross, entry, gameTime: now };
}
/**
 * Portal intake at wall contact — mouth-side gates + immediate traverse.
 *
 * @param {object} state
 * @param {object} entity
 * @param {object} segment — wall segment with passageEdge, gridCol/Row/Side
 * @returns {boolean} true when the entity teleported this call
 */
export function tryPortalIntake(state, entity, segment) {
    const ctx = assemblePortalIntakeContext(state, entity, segment);
    if (!ctx) return false;
    if (applyPortalTraverse(state, entity, ctx.entry)) return true;
    rejectPortalIntake(entity, ctx.cross, ctx.grid, ctx.gameTime);
    return false;
}
/** Wire portal wall contact into the passage handler registry. */
export function registerSandboxPassageHandlers() {
    registerPortalPassageStepHandler();
    registerPassageWallContactHandler(PASSAGE_MODE.Portal, (ctx) => {
        if (ctx.state && tryPortalIntake(ctx.state, ctx.entity, ctx.segment)) return "consumed";
        if (!portalEdgeBlocksCollision(ctx.edge, ctx.ownerCol, ctx.ownerRow, ctx.ownerSide, ctx.entity, ctx.bodyRadius, ctx.vx, ctx.vy, ctx.dispX, ctx.dispY, ctx.grid)) return "skip";
        return "collide";
    });
}
