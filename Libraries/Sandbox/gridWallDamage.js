import { cellInRect } from "../Spatial/grid/GridUtils.js";
import { isRailWallEdge } from "../Spatial/grid/CellEdge.js";
import { cellIsStaticWall } from "../Spatial/grid/gridCellTopology.js";
import { createDeferredGridWallCommit } from "./deferredGridWallCommit.js";
/** @typedef {{ kind: "voxel", col: number, row: number } | { kind: "rail", col: number, row: number, side: number }} WallDamageTarget */
export function wallDamageKey(target) {
    return target.kind === "voxel" ? `v:${target.col},${target.row}` : `r:${target.col},${target.row}:${target.side}`;
}
export function resolveWallDamageTarget(grid, segment) {
    if (segment.passageEdge) return null;
    const col = segment.gridCol;
    const row = segment.gridRow;
    if (!cellInRect(col, row, grid.cols, grid.rows)) return null;
    if (segment.isStaticGridProxy && cellIsStaticWall(grid, col, row)) return { kind: "voxel", col, row };
    if (segment.isEdgeRail) {
        const side = segment.gridSide;
        if (side == null) return null;
        const edge = grid.edgeStore.get(col, row, side, grid.cols);
        if (!isRailWallEdge(edge)) return null;
        return { kind: "rail", col, row, side };
    }
    return null;
}
export function computeWallBreakStrength(preSpeed, approachDot, config) {
    if (preSpeed < config.minStrikeSpeed || approachDot >= 0) return 0;
    const speedSpan = config.referenceMaxSpeed - config.minStrikeSpeed;
    const speedT = speedSpan <= 0 ? 1 : Math.min(1, Math.max(0, (preSpeed - config.minStrikeSpeed) / speedSpan));
    const angleT = Math.min(1, -approachDot / preSpeed);
    return speedT * angleT;
}
export function getGridWallDamageState(state) {
    return state.sandbox?.gridWallDamage ?? null;
}
export function createGridWallDamage(state, config) {
    return { config, pendingBreaks: new Map(), commit: createDeferredGridWallCommit(state) };
}
export function resolveKineticWallDamage(state, entity, spatialFrame, wallResolver) {
    const wallDamage = getGridWallDamageState(state);
    const preSpeed = Math.hypot(entity.vx ?? 0, entity.vy ?? 0);
    const collided = wallResolver.resolve(entity, spatialFrame);
    if (!wallDamage || !entity._wallResolveHits?.length) return collided;
    queueWallHits(wallDamage, state.obstacleGrid, entity._wallResolveHits, preSpeed);
    return collided;
}
export function flushPendingWallDamage(state) {
    const wallDamage = getGridWallDamageState(state);
    if (!wallDamage) return null;
    return applyPendingWallDamage(state, wallDamage);
}
function targetToSegment(target) {
    if (target.kind === "voxel") return { gridCol: target.col, gridRow: target.row, isStaticGridProxy: true, isEdgeRail: false };
    return { gridCol: target.col, gridRow: target.row, gridSide: target.side, isEdgeRail: true, isStaticGridProxy: false };
}
export function queueWallHits(wallDamage, grid, hits, preSpeed) {
    const config = wallDamage.config;
    for (let i = 0; i < hits.length; i++) {
        const hit = hits[i];
        const target = resolveWallDamageTarget(grid, hit.segment);
        if (!target) continue;
        const strength = computeWallBreakStrength(preSpeed, hit.approachDot, config);
        if (strength < config.minBreakStrength) continue;
        const key = wallDamageKey(target);
        if (!wallDamage.pendingBreaks.has(key)) wallDamage.pendingBreaks.set(key, { target, strength, hit });
    }
}
export function applyPendingWallDamage(state, wallDamage) {
    if (!wallDamage.pendingBreaks.size) return null;
    const grid = state.obstacleGrid;
    const voxels = [];
    const rails = [];
    for (const item of wallDamage.pendingBreaks.values()) {
        const target = item.target;
        if (!resolveWallDamageTarget(grid, targetToSegment(target))) continue;
        if (target.kind === "voxel") voxels.push({ col: target.col, row: target.row });
        else rails.push({ col: target.col, row: target.row, side: target.side });
    }
    wallDamage.pendingBreaks.clear();
    if (voxels.length || rails.length) wallDamage.commit.clearWalls({ voxels, rails });
    return wallDamage.commit.flush();
}
