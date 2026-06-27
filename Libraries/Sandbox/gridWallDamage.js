import { cellInRect } from "../Spatial/grid/GridUtils.js";
import { isRailWallEdge } from "../Spatial/grid/CellEdge.js";
import { cellIsStaticWall, cellEdgeEndpoints } from "../Spatial/grid/gridCellTopology.js";
import { createDeferredGridWallCommit } from "./deferredGridWallCommit.js";
import { addWorldPropToState, removeWorldPropFromState } from "../../GameState/EntityRegistry.js";
import { acquireWorldProp } from "../Props/worldPropPool.js";
import { applyPropBoxFootprint } from "../Props/propStrategy.js";
import { fracturePropOnImpact, spawnChunkFractureShards, spawnGlassShatterShards } from "../Props/propFracture.js";
import { wakeKineticBody } from "../Motion/kineticSleep.js";
import { getVoxelWallInfo, getRailWallInfo } from "./gridWallEdit.js";
import { resolveRoomGraphFloorProfileIdAtCell } from "../RoomGraph/roomGraphSurfaceProfile.js";
import { surfaceProfileDefaults } from "../Procedural/SurfaceProfileProvider.js";
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
    return { config, pendingBreaks: new Map(), commit: createDeferredGridWallCommit(state), spatialFrame: null };
}
export function resolveKineticWallDamage(state, entity, spatialFrame, wallResolver) {
    const wallDamage = getGridWallDamageState(state);
    const preSpeed = Math.hypot(entity.vx ?? 0, entity.vy ?? 0);
    const collided = wallResolver.resolve(entity, spatialFrame);
    if (!wallDamage || !entity._wallResolveHits?.length) return collided;
    // Store spatialFrame on wallDamage for use during flush/promotion
    wallDamage.spatialFrame = spatialFrame;
    queueWallHits(wallDamage, state.obstacleGrid, entity._wallResolveHits, preSpeed, entity);
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
export function queueWallHits(wallDamage, grid, hits, preSpeed, entity = null) {
    const config = wallDamage.config;
    for (let i = 0; i < hits.length; i++) {
        const hit = hits[i];
        const target = resolveWallDamageTarget(grid, hit.segment);
        if (!target) continue;
        const strength = computeWallBreakStrength(preSpeed, hit.approachDot, config);
        if (strength < config.minBreakStrength) continue;
        const key = wallDamageKey(target);
        if (!wallDamage.pendingBreaks.has(key)) {
            const cx = hit.contactX ?? (hit.segment ? hit.segment.x : null) ?? grid.gridCenterX(target.col);
            const cy = hit.contactY ?? (hit.segment ? hit.segment.y : null) ?? grid.gridCenterY(target.row);
            wallDamage.pendingBreaks.set(key, {
                target,
                strength,
                hit,
                contactX: cx,
                contactY: cy,
                normalX: hit.normalX ?? 0,
                normalY: hit.normalY ?? 0,
                sourceVx: entity ? (entity.vx ?? 0) : 0,
                sourceVy: entity ? (entity.vy ?? 0) : 0,
                sourceSpeed: preSpeed,
                sourceId: entity ? (entity.id ?? entity._physId) : null,
                sourceKind: entity ? entity.type : null,
                sourceMass: entity ? (entity.mass ?? 1) : 1,
            });
        }
    }
}
export function applyPendingWallDamage(state, wallDamage) {
    if (!wallDamage.pendingBreaks.size) return null;
    const grid = state.obstacleGrid;
    const descriptors = [];
    for (const item of wallDamage.pendingBreaks.values()) {
        const target = item.target;
        if (!resolveWallDamageTarget(grid, targetToSegment(target))) continue;
        if (target.kind === "voxel") {
            const info = getVoxelWallInfo(grid, target.col, target.row);
            if (!info) continue;
            const cx = grid.gridCenterX(target.col);
            const cy = grid.gridCenterY(target.row);
            const profileId = resolveRoomGraphFloorProfileIdAtCell(state, target.col, target.row) ?? state.worldSurfaces?.surfaceProfileOverride ?? surfaceProfileDefaults.defaultId;
            const wallHeightPx = info.heightLevel * grid.cellSize;
            descriptors.push({
                kind: "voxel",
                col: target.col,
                row: target.row,
                x: cx,
                y: cy,
                angle: 0,
                width: grid.cellSize,
                height: grid.cellSize,
                wallHeight: wallHeightPx,
                wallChunkProfileId: profileId,
                wallChunkHeightPx: wallHeightPx,
                wallChunkKind: "voxel",
                strength: item.strength,
                contactX: item.contactX ?? cx,
                contactY: item.contactY ?? cy,
                normalX: item.normalX,
                normalY: item.normalY,
                sourceVx: item.sourceVx,
                sourceVy: item.sourceVy,
                sourceSpeed: item.sourceSpeed,
                sourceId: item.sourceId,
                sourceKind: item.sourceKind,
                sourceMass: item.sourceMass ?? 1,
            });
        } else {
            const info = getRailWallInfo(grid, target.col, target.row, target.side);
            if (!info) continue;
            const p1 = { x: 0, y: 0 };
            const p2 = { x: 0, y: 0 };
            cellEdgeEndpoints(grid, target.col, target.row, target.side, p1, p2, 0);
            const cx = (p1.x + p2.x) * 0.5;
            const cy = (p1.y + p2.y) * 0.5;
            const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            const profileId = resolveRoomGraphFloorProfileIdAtCell(state, target.col, target.row) ?? state.worldSurfaces?.surfaceProfileOverride ?? surfaceProfileDefaults.defaultId;
            const wallHeightPx = info.heightLevel * grid.cellSize;
            descriptors.push({
                kind: "rail",
                col: target.col,
                row: target.row,
                side: target.side,
                x: cx,
                y: cy,
                angle: angle,
                width: grid.cellSize,
                height: info.thicknessLevel ?? 1,
                wallHeight: wallHeightPx,
                wallChunkProfileId: profileId,
                wallChunkHeightPx: wallHeightPx,
                wallChunkKind: "rail",
                strength: item.strength,
                contactX: item.contactX ?? cx,
                contactY: item.contactY ?? cy,
                normalX: item.normalX,
                normalY: item.normalY,
                sourceVx: item.sourceVx,
                sourceVy: item.sourceVy,
                sourceSpeed: item.sourceSpeed,
                sourceId: item.sourceId,
                sourceKind: item.sourceKind,
                sourceMass: item.sourceMass ?? 1,
            });
        }
    }
    wallDamage.pendingBreaks.clear();
    const voxels = [];
    const rails = [];
    for (const desc of descriptors)
        if (desc.kind === "voxel") voxels.push({ col: desc.col, row: desc.row });
        else rails.push({ col: desc.col, row: desc.row, side: desc.side });
    let commitBounds = null;
    if (voxels.length || rails.length) {
        wallDamage.commit.clearWalls({ voxels, rails });
        commitBounds = wallDamage.commit.flush();
    }
    // Now promote the broken walls to WorldProps and apply fracture!
    const spatialFrame = wallDamage.spatialFrame ?? null;
    // Clean up stored spatialFrame to prevent memory retention
    wallDamage.spatialFrame = null;
    for (const desc of descriptors) {
        const propType = desc.kind === "voxel" ? "wall_voxel_chunk" : "wall_rail_chunk";
        const prop = acquireWorldProp(desc.x, desc.y, propType, desc.angle);
        applyPropBoxFootprint(prop, desc.width / 2, desc.height / 2);
        prop.height = desc.wallHeight;
        prop.wallChunkProfileId = desc.wallChunkProfileId;
        prop.wallChunkHeightPx = desc.wallChunkHeightPx;
        prop.wallChunkKind = desc.wallChunkKind;
        // Push prop opposite to collision normal scaled by mass ratio
        const sourceMass = desc.sourceMass ?? 1;
        const propMass = prop.mass ?? 1;
        const massFactor = sourceMass / (sourceMass + propMass);
        const speed = Math.max(20, desc.sourceSpeed * 0.6 * (massFactor * 2));
        prop.vx = -desc.normalX * speed;
        prop.vy = -desc.normalY * speed;
        prop.angularVelocity = (Math.random() - 0.5) * 2.0;
        addWorldPropToState(state, prop);
        wakeKineticBody(prop);
        if (spatialFrame?.admitKineticProp && spatialFrame.populatedMembershipGen >= 0) spatialFrame.admitKineticProp(prop, state);
        // Apply impact fracture
        const impactForce = desc.sourceSpeed * 0.5 + 10;
        const fracture = fracturePropOnImpact(prop, desc.contactX, desc.contactY, impactForce);
        if (fracture)
            if (prop.strategy?.fractureMode === "glass") {
                const safeFrame = spatialFrame && typeof spatialFrame.evictKineticProp === "function" ? spatialFrame : { evictKineticProp() {}, ...spatialFrame };
                removeWorldPropFromState(state, prop, safeFrame);
                const shards = spawnGlassShatterShards(state, prop, fracture, safeFrame);
                for (let i = 0; i < shards.length; i++) shards[i].height = prop.height;
            } else {
                const shards = spawnChunkFractureShards(state, prop, fracture, spatialFrame);
                for (let i = 0; i < shards.length; i++) shards[i].height = prop.height;
                wakeKineticBody(prop);
            }
    }
    return commitBounds;
}
