import { allocateEntityEid, clearWorldPropSpawnPose } from "../../Core/entitySlots.js";
import propCatalog from "../../Assets/props/index.js";
import { wakeKineticBody, writeLivePolygon, releaseLivePolygon, kineticFootprintArea, applyVelocityDamping, normalizeKineticBody, collisionPartsList, markHitCompoundParts, primitiveDragFrictionEid, kineticMassFromFootprint, removeLiveKineticEid } from "./physics.js";
import { kineticDynamicSlab, kineticStaticSlab, pendingWallBreaks, clearPendingBreakHash, pendingBreakRowForKey, insertPendingBreakKey, wallSpawnScratch, ENGINE_F32, ENGINE_U8, F_SHATTER_SEEDS, F_OUT_CENTROID_X, F_OUT_CENTROID_Y, F_OUT_AREA, F_OUT_RADIUS, F_OUT_CLOSEST_X, F_OUT_CLOSEST_Y, F_OUT_DEBRIS_START, F_OUT_DEBRIS_COUNT, F_OUT_MOTION_VX, F_OUT_MOTION_VY, F_OUT_MOTION_W, F_OUT_REMNANT, F_VEC_A, F_OUT_ORIGIN_X, F_OUT_ORIGIN_Y, F_OUT_FACING, F_OUT_IMPACT_LOCAL_X, F_OUT_IMPACT_LOCAL_Y, F_OUT_IMPACT_FORCE, F_OUT_VORONOI_HANDLE, F_OUT_VORONOI_VERTS, F_EDGE_P1X, F_EDGE_P1Y, F_EDGE_P2X, F_EDGE_P2Y, MAX_PENDING_WALL_BREAKS, deferredFractureSlab, entityRefs, entityVx, entityVy, entityW, entityKind, entityFractureCooldown, entityFlags, GrowI32 } from "../../Core/engineMemory.js";
import { WALL_SEG_VOXEL, WALL_SEG_EDGE_RAIL, KINETIC_PAIR_CIRCLE_CIRCLE, SHAPE_TYPE_POLYGON, WALL_STAMP_VOXEL, WALL_STAMP_RAIL, ENTITY_FLAG_DEAD, ENTITY_FLAG_FRACTURE_SET, ENTITY_FLAG_FRACTURE_VAL, ENTITY_FLAG_PENDING_FRACTURE, ENTITY_KIND_DEBRIS } from "../../Core/engineEnums.js";
import { createDeferredGridWallCommit, resolveSurfaceProfileId, SURFACE_MATERIAL_OWNER, resolveEdgeSurfaceProfileId, isRailWallEdge, cellIsStaticWall, cellEdgeEndpointsIdx, RailWallBatch, edgeRailEmitOwner, edgeNeighborIdx, edgeRailCollisionThicknessPx, railWallCapLevel, neighborFillLevel } from "../Spatial/spatial.js";
import { convexFootprintHalfExtents, polygonCentroid2DInto, pointInPolygon, polygonSignedArea2D, deterministicUnitRandom } from "../Math/math.js";
import { applyPropBoxFootprint, sharedWorldPropStrategy, invalidateEntityFootprint, resolveAssetPropHeight, WorldProp } from "../Props/props.js";
import { removeWorldPropEid } from "../../GameState/EntityRegistry.js";
export const FRACTURE_TUNING = { shared: { minPieceSize: 5, cooldown: 8, refSpan: 40, sizeForceExp: 1.25 }, default: { impactThreshold: 6, minShardArea: 12, maxShardsPerShatter: 12 }, wallSpawn: { forceBias: 10 }, burst: { maxBurst: 35, baseBurst: 8, burstForceScale: 0.12, spinScale: 0.4 } };
const DEFAULT_FRACTURE_CONFIG = Object.freeze({ impactThreshold: FRACTURE_TUNING.default.impactThreshold, minShardArea: FRACTURE_TUNING.default.minShardArea, maxShardsPerShatter: FRACTURE_TUNING.default.maxShardsPerShatter });
const FRACTURE_IMPACT_THRESHOLD = DEFAULT_FRACTURE_CONFIG.impactThreshold;
const FRACTURE_MIN_SHARD_AREA = DEFAULT_FRACTURE_CONFIG.minShardArea;
export const FRACTURE_MAX_SHARDS_PER_SHATTER = DEFAULT_FRACTURE_CONFIG.maxShardsPerShatter;
const FRACTURE_MIN_PIECE_SIZE = FRACTURE_TUNING.shared.minPieceSize;
export function requiredImpactForce(eid, baseThreshold = FRACTURE_IMPACT_THRESHOLD) {
    const span = Math.max(FractureEngine.propFractureSpan(eid), FRACTURE_MIN_PIECE_SIZE);
    const t = FRACTURE_TUNING.shared.refSpan / span;
    return baseThreshold * Math.pow(Math.max(1, t), FRACTURE_TUNING.shared.sizeForceExp);
}
const SHATTER_SEEDS = ENGINE_F32.subarray(F_SHATTER_SEEDS, F_SHATTER_SEEDS + FRACTURE_MAX_SHARDS_PER_SHATTER * 2);
export function effectiveFracture(prop) {
    if (prop.fractureEnabled === true) return DEFAULT_FRACTURE_CONFIG;
    if (prop.fractureEnabled === false) return null;
    if (prop.strategy?.fracture) return DEFAULT_FRACTURE_CONFIG;
    return null;
}
function effectiveFractureEid(eid) {
    const flags = entityFlags[eid];
    if ((flags & ENTITY_FLAG_FRACTURE_SET) === 0) return null;
    if ((flags & ENTITY_FLAG_FRACTURE_VAL) === 0) return null;
    return DEFAULT_FRACTURE_CONFIG;
}
const GEOM_VERT_BUCKETS = [8, 16, 32, 64, 128, 256, 512];
const MAX_FRACTURE_DEBRIS = 512;
const MAX_CLIP_VERTS = 512;
const WALL_KEY_RAIL_BIT = 1 << 30;
const WALL_KEY_SIDE_SHIFT = 28;
const WALL_KEY_IDX_MASK = (1 << 28) - 1;
let sWallKind = -1;
let sWallIdx = 0;
let sWallSide = 0;
const railFlushBatch = new RailWallBatch(MAX_PENDING_WALL_BREAKS);
function copyDebrisPolygonGeometry(dst, src) {
    const verts = src.shape.vertices;
    const n = verts.length;
    writeLivePolygon(dst, verts, n);
    dst.footprintArea = src.footprintArea;
    dst.radius = src.radius;
}
const debrisWorldPropPool = [];
const spawnedScratch = [];
const voxelScratch = [];
const admitEidScratch = new GrowI32(32);
const integratedScratch = [];
const breakSourceScratch = { id: -1, type: "", strategy: null, x: 0, y: 0, vx: 0, vy: 0, angularVelocity: 0, facing: 0, shape: null, footprintArea: undefined, radius: 0, wallChunkProfileId: undefined, wallChunkHeightPx: undefined, height: undefined };
let fractureRandBase = 0;
let fractureRandCall = 0;
function seedFractureRand(worldHitX, worldHitY, impactForce, salt = 0) {
    fractureRandCall = 0;
    fractureRandBase = Math.imul(Math.floor(worldHitX * 1000), 73856093) ^ Math.imul(Math.floor(worldHitY * 1000), 19349663) ^ Math.imul(Math.floor(impactForce * 100), 83492791) ^ salt;
}
function nextFractureRand() {
    return deterministicUnitRandom(fractureRandBase ^ Math.imul(++fractureRandCall, 2654435761));
}
let clipLastX = NaN,
    clipLastY = NaN;
function clipPushVert(dst, outCount, x, y) {
    if (outCount > 0) {
        const dx = clipLastX - x;
        const dy = clipLastY - y;
        if (dx * dx + dy * dy < 1e-6) return outCount;
    }
    dst[outCount * 2] = x;
    dst[outCount * 2 + 1] = y;
    clipLastX = x;
    clipLastY = y;
    return outCount + 1;
}
class FractureGeomPool {
    constructor() {
        this.buckets = GEOM_VERT_BUCKETS.map(() => []);
        this.buffers = [null];
        this.bucketOf = new Uint8Array(1);
        this.freeHandles = [];
        this.nextHandle = 1;
        this.clipA = new Float32Array(MAX_CLIP_VERTS * 2);
        this.clipB = new Float32Array(MAX_CLIP_VERTS * 2);
    }
    _bucketIndex(minCap) {
        for (let i = 0; i < GEOM_VERT_BUCKETS.length; i++) if (GEOM_VERT_BUCKETS[i] >= minCap) return i;
        return GEOM_VERT_BUCKETS.length - 1;
    }
    _ensureHandleCapacity(handle) {
        if (handle < this.buffers.length) return;
        const next = Math.max(handle + 1, this.buffers.length * 2);
        const grown = new Array(next);
        for (let i = 0; i < this.buffers.length; i++) grown[i] = this.buffers[i];
        this.buffers = grown;
        const buckets = new Uint8Array(next);
        buckets.set(this.bucketOf);
        this.bucketOf = buckets;
    }
    borrow(minVertCapacity) {
        const bucket = this._bucketIndex(minVertCapacity);
        const capacity = GEOM_VERT_BUCKETS[bucket];
        const floatCapacity = capacity * 2;
        let buffer = this.buckets[bucket].pop();
        if (!buffer || buffer.length < floatCapacity) buffer = new Float32Array(floatCapacity);
        let handle = this.freeHandles.pop();
        if (handle === undefined) handle = this.nextHandle++;
        this._ensureHandleCapacity(handle);
        this.buffers[handle] = buffer;
        this.bucketOf[handle] = bucket;
        return handle;
    }
    release(handle) {
        const buffer = this.buffers[handle];
        this.buckets[this.bucketOf[handle]].push(buffer);
        this.buffers[handle] = null;
        this.freeHandles.push(handle);
    }
    buffer(handle) {
        return this.buffers[handle];
    }
    copyVerts(handle, src, vertCount) {
        const dst = this.buffer(handle);
        const n = vertCount * 2;
        for (let i = 0; i < n; i++) dst[i] = src[i];
    }
    clipHalfPlaneInPlace(src, srcVertCount, ax, ay, nx, ny, dst) {
        if (srcVertCount === 0) return 0;
        let outCount = 0;
        clipLastX = NaN;
        clipLastY = NaN;
        for (let i = 0; i < srcVertCount; i++) {
            const j = (i + 1) % srcVertCount;
            const cx = src[i * 2];
            const cy = src[i * 2 + 1];
            const nxCoord = src[j * 2];
            const nyCoord = src[j * 2 + 1];
            const currIn = (cx - ax) * nx + (cy - ay) * ny >= -1e-9;
            const nextIn = (nxCoord - ax) * nx + (nyCoord - ay) * ny >= -1e-9;
            if (currIn && nextIn) outCount = clipPushVert(dst, outCount, nxCoord, nyCoord);
            else if (currIn && !nextIn) {
                const dx = nxCoord - cx;
                const dy = nyCoord - cy;
                const denom = dx * nx + dy * ny;
                let t = denom === 0 ? 0 : -((cx - ax) * nx + (cy - ay) * ny) / denom;
                t = Math.max(0, Math.min(1, t || 0));
                outCount = clipPushVert(dst, outCount, cx + dx * t, cy + dy * t);
            } else if (!currIn && nextIn) {
                const dx = nxCoord - cx;
                const dy = nyCoord - cy;
                const denom = dx * nx + dy * ny;
                let t = denom === 0 ? 0 : -((cx - ax) * nx + (cy - ay) * ny) / denom;
                t = Math.max(0, Math.min(1, t || 0));
                outCount = clipPushVert(dst, outCount, cx + dx * t, cy + dy * t);
                outCount = clipPushVert(dst, outCount, nxCoord, nyCoord);
            }
        }
        if (outCount > 1) {
            const dx = dst[0] - clipLastX;
            const dy = dst[1] - clipLastY;
            if (dx * dx + dy * dy < 1e-6) outCount--;
        }
        return outCount;
    }
    voronoiCellIntoEngine(flatVerts, vertCount, seeds, seedIndex, seedCount) {
        let count = vertCount;
        for (let k = 0; k < count; k++) {
            this.clipA[k * 2] = flatVerts[k * 2];
            this.clipA[k * 2 + 1] = flatVerts[k * 2 + 1];
        }
        const six = seeds[seedIndex * 2];
        const siy = seeds[seedIndex * 2 + 1];
        let src = this.clipA;
        let dst = this.clipB;
        for (let j = 0; j < seedCount; j++) {
            if (j === seedIndex) continue;
            const sjx = seeds[j * 2];
            const sjy = seeds[j * 2 + 1];
            const mx = (six + sjx) * 0.5;
            const my = (siy + sjy) * 0.5;
            count = this.clipHalfPlaneInPlace(src, count, mx, my, six - sjx, siy - sjy, dst);
            if (count < 3) {
                ENGINE_F32[F_OUT_VORONOI_HANDLE] = 0;
                ENGINE_F32[F_OUT_VORONOI_VERTS] = 0;
                return;
            }
            const tmp = src;
            src = dst;
            dst = tmp;
        }
        const handle = this.borrow(count);
        this.copyVerts(handle, src, count);
        ENGINE_F32[F_OUT_VORONOI_HANDLE] = handle;
        ENGINE_F32[F_OUT_VORONOI_VERTS] = count;
    }
    centerVertsInPlace(handle, vertCount) {
        const buf = this.buffer(handle);
        polygonCentroid2DInto(F_OUT_CENTROID_X, buf, 0, vertCount * 2);
        const cx = ENGINE_F32[F_OUT_CENTROID_X];
        const cy = ENGINE_F32[F_OUT_CENTROID_Y];
        const signedArea = ENGINE_F32[F_OUT_AREA];
        for (let i = 0; i < vertCount; i++) {
            buf[i * 2] -= cx;
            buf[i * 2 + 1] -= cy;
        }
        ENGINE_F32[F_OUT_AREA] = Math.abs(signedArea);
        let maxRadiusSq = 0;
        for (let i = 0; i < vertCount; i++) {
            const vx = buf[i * 2];
            const vy = buf[i * 2 + 1];
            const distSq = vx * vx + vy * vy;
            if (distSq > maxRadiusSq) maxRadiusSq = distSq;
        }
        ENGINE_F32[F_OUT_RADIUS] = Math.sqrt(maxRadiusSq);
    }
}
class FractureDebrisStore {
    constructor(geomPool) {
        this.geomPool = geomPool;
        this.write = 0;
        this.centroidX = new Float32Array(MAX_FRACTURE_DEBRIS);
        this.centroidY = new Float32Array(MAX_FRACTURE_DEBRIS);
        this.footprintArea = new Float32Array(MAX_FRACTURE_DEBRIS);
        this.boundingRadius = new Float32Array(MAX_FRACTURE_DEBRIS);
        this.vertHandle = new Uint32Array(MAX_FRACTURE_DEBRIS);
        this.vertCount = new Uint16Array(MAX_FRACTURE_DEBRIS);
    }
    reset() {
        this.write = 0;
    }
    appendCenteredPolygon(handle, vertCount, worldCentroidX = 0, worldCentroidY = 0) {
        this.geomPool.centerVertsInPlace(handle, vertCount);
        const i = this.write++;
        this.vertHandle[i] = handle;
        this.vertCount[i] = vertCount;
        this.centroidX[i] = worldCentroidX + ENGINE_F32[F_OUT_CENTROID_X];
        this.centroidY[i] = worldCentroidY + ENGINE_F32[F_OUT_CENTROID_Y];
        this.footprintArea[i] = ENGINE_F32[F_OUT_AREA];
        this.boundingRadius[i] = ENGINE_F32[F_OUT_RADIUS];
        return i;
    }
}
function releaseDebrisGeomRange(stores, start, count) {
    const debris = stores.debris;
    for (let i = start; i < start + count; i++) if (debris.vertHandle[i]) stores.geom.release(debris.vertHandle[i]);
}
function dropShatterSeed(seeds, seedIndex, seedCount) {
    const last = seedCount - 1;
    if (seedIndex < last) {
        seeds[seedIndex * 2] = seeds[last * 2];
        seeds[seedIndex * 2 + 1] = seeds[last * 2 + 1];
    }
    return last;
}
export function computeWallBreakStrength(preSpeed, approachDot, config) {
    if (preSpeed < config.minStrikeSpeed || approachDot >= 0) return 0;
    const speedSpan = config.referenceMaxSpeed - config.minStrikeSpeed;
    const speedT = speedSpan <= 0 ? 1 : Math.min(1, Math.max(0, (preSpeed - config.minStrikeSpeed) / speedSpan));
    const angleT = Math.min(1, -approachDot / preSpeed);
    return speedT * angleT;
}
export function packWallDamageKey(kind, idx, side, grid) {
    if (kind === WALL_STAMP_VOXEL) return idx & WALL_KEY_IDX_MASK;
    let i = idx;
    let s = side;
    if (grid && !edgeRailEmitOwner(grid, i, s)) {
        const nIdx = edgeNeighborIdx(i, s, grid);
        if (nIdx !== -1) {
            i = nIdx;
            s = (s + 2) % 4;
        }
    }
    return WALL_KEY_RAIL_BIT | ((s & 3) << WALL_KEY_SIDE_SHIFT) | (i & WALL_KEY_IDX_MASK);
}
export function classifyWallDamageSegment(grid, gridIdx, flags, gridSide) {
    sWallKind = -1;
    sWallIdx = 0;
    sWallSide = 0;
    if (gridIdx < 0 || gridIdx >= grid.grid.length) return -1;
    if ((flags & WALL_SEG_VOXEL) !== 0 && cellIsStaticWall(grid, gridIdx)) {
        sWallKind = WALL_STAMP_VOXEL;
        sWallIdx = gridIdx;
        return WALL_STAMP_VOXEL;
    }
    if ((flags & WALL_SEG_EDGE_RAIL) !== 0) {
        const edge = grid.getCellEdge(gridIdx, gridSide);
        if (!isRailWallEdge(edge)) return -1;
        sWallKind = WALL_STAMP_RAIL;
        sWallIdx = gridIdx;
        sWallSide = gridSide;
        return WALL_STAMP_RAIL;
    }
    return -1;
}
function pendingTargetStillValid(grid, pending, row) {
    if (pending.kind[row] === WALL_STAMP_VOXEL) return cellIsStaticWall(grid, pending.idx[row]);
    const edge = grid.getCellEdge(pending.idx[row], pending.side[row]);
    return isRailWallEdge(edge);
}
export function createGridWallDamage(state, config) {
    clearPendingBreakHash();
    pendingWallBreaks.count = 0;
    return { config, pending: pendingWallBreaks, commit: createDeferredGridWallCommit(state), spatialFrame: null, lastCommitBounds: null, lastSpawned: [], lastSpawnedCount: 0 };
}
export function resolveKineticWallDamage(state, eid, spatialFrame) {
    const wallResolver = state.wallResolver;
    const wallDamage = state.gridWallDamage;
    const preSpeed = Math.hypot(entityVx[eid], entityVy[eid]);
    const shouldBreakWallHit = preSpeed > 0 ? (approachDot) => computeWallBreakStrength(preSpeed, approachDot, wallDamage.config) >= wallDamage.config.minBreakStrength : null;
    const collided = wallResolver.resolve(eid, spatialFrame, shouldBreakWallHit);
    const hits = wallResolver.hits;
    if (!hits.count) return collided;
    wallDamage.spatialFrame = spatialFrame;
    queueWallHits(wallDamage, state.obstacleGrid, hits, preSpeed, eid);
    return collided;
}
export function queueWallHits(wallDamage, grid, hits, preSpeed, eid) {
    const config = wallDamage.config;
    const pending = wallDamage.pending;
    for (let i = 0; i < hits.count; i++) {
        const kind = classifyWallDamageSegment(grid, hits.gridIdx[i], hits.flags[i], hits.gridSide[i]);
        if (kind < 0) continue;
        const strength = computeWallBreakStrength(preSpeed, hits.approachDot[i], config);
        if (strength < config.minBreakStrength) continue;
        const key = packWallDamageKey(kind, sWallIdx, sWallSide, grid);
        if (pendingBreakRowForKey(key) >= 0) continue;
        const row = pending.count++;
        insertPendingBreakKey(key, row);
        pending.kind[row] = kind;
        pending.idx[row] = sWallIdx;
        pending.side[row] = sWallSide;
        pending.strength[row] = strength;
        let contactX = hits.contactX[i];
        let contactY = hits.contactY[i];
        if (!Number.isFinite(contactX)) contactX = grid.gridCenterXByIdx(sWallIdx);
        if (!Number.isFinite(contactY)) contactY = grid.gridCenterYByIdx(sWallIdx);
        pending.contactX[row] = contactX;
        pending.contactY[row] = contactY;
        pending.normalX[row] = hits.normalX[i];
        pending.normalY[row] = hits.normalY[i];
        pending.sourceSpeed[row] = preSpeed;
        pending.sourceMass[row] = kineticStaticSlab.mass[eid];
    }
}
export function applyPendingWallDamage(state) {
    const wallDamage = state.gridWallDamage;
    if (!wallDamage.pending.count) return;
    const grid = state.obstacleGrid;
    const pending = wallDamage.pending;
    const spawn = wallSpawnScratch;
    spawn.count = 0;
    for (let row = 0; row < pending.count; row++) {
        if (!pendingTargetStillValid(grid, pending, row)) continue;
        const idx = pending.idx[row];
        const out = spawn.count;
        if (pending.kind[row] === WALL_STAMP_VOXEL) {
            if (!cellIsStaticWall(grid, idx)) continue;
            const cx = grid.gridCenterXByIdx(idx);
            const cy = grid.gridCenterYByIdx(idx);
            const cellsPerChunk = state.worldSurfaces.settings.cellsPerChunk;
            const profileId = resolveSurfaceProfileId(grid, SURFACE_MATERIAL_OWNER.Cell, state.worldSurfaces.activeSurfaceProfileId, cellsPerChunk, idx);
            const wallHeightPx = grid.grid[idx] * grid.cellSize;
            spawn.kind[out] = WALL_STAMP_VOXEL;
            spawn.idx[out] = idx;
            spawn.side[out] = 0;
            spawn.x[out] = cx;
            spawn.y[out] = cy;
            spawn.angle[out] = 0;
            spawn.width[out] = grid.cellSize;
            spawn.height[out] = grid.cellSize;
            spawn.wallHeight[out] = wallHeightPx;
            spawn.profileId[out] = profileId;
            spawn.strength[out] = pending.strength[row];
            spawn.contactX[out] = pending.contactX[row] || cx;
            spawn.contactY[out] = pending.contactY[row] || cy;
            spawn.normalX[out] = pending.normalX[row];
            spawn.normalY[out] = pending.normalY[row];
            spawn.sourceSpeed[out] = pending.sourceSpeed[row];
            spawn.sourceMass[out] = pending.sourceMass[row];
            spawn.count++;
        } else {
            const side = pending.side[row];
            const edge = grid.getCellEdge(idx, side);
            if (!isRailWallEdge(edge)) continue;
            cellEdgeEndpointsIdx(grid, idx, side, ENGINE_F32, F_EDGE_P1X, F_EDGE_P2X, 0);
            const cx = (ENGINE_F32[F_EDGE_P1X] + ENGINE_F32[F_EDGE_P2X]) * 0.5;
            const cy = (ENGINE_F32[F_EDGE_P1Y] + ENGINE_F32[F_EDGE_P2Y]) * 0.5;
            const angle = Math.atan2(ENGINE_F32[F_EDGE_P2Y] - ENGINE_F32[F_EDGE_P1Y], ENGINE_F32[F_EDGE_P2X] - ENGINE_F32[F_EDGE_P1X]);
            const cellsPerChunk = state.worldSurfaces.settings.cellsPerChunk;
            const profileId = resolveEdgeSurfaceProfileId(grid, idx, side, state.worldSurfaces.activeSurfaceProfileId, cellsPerChunk);
            const thicknessPx = edgeRailCollisionThicknessPx(grid, idx, side);
            const wallHeightPx = railWallCapLevel(edge, neighborFillLevel(grid, idx, side)) * grid.cellSize;
            spawn.kind[out] = WALL_STAMP_RAIL;
            spawn.idx[out] = idx;
            spawn.side[out] = side;
            spawn.x[out] = cx;
            spawn.y[out] = cy;
            spawn.angle[out] = angle;
            spawn.width[out] = grid.cellSize;
            spawn.height[out] = thicknessPx;
            spawn.wallHeight[out] = wallHeightPx;
            spawn.profileId[out] = profileId;
            spawn.strength[out] = pending.strength[row];
            spawn.contactX[out] = pending.contactX[row] || cx;
            spawn.contactY[out] = pending.contactY[row] || cy;
            spawn.normalX[out] = pending.normalX[row];
            spawn.normalY[out] = pending.normalY[row];
            spawn.sourceSpeed[out] = pending.sourceSpeed[row];
            spawn.sourceMass[out] = pending.sourceMass[row];
            spawn.count++;
        }
    }
    clearPendingBreakHash();
    pending.count = 0;
    voxelScratch.length = 0;
    railFlushBatch.count = 0;
    for (let i = 0; i < spawn.count; i++)
        if (spawn.kind[i] === WALL_STAMP_VOXEL) voxelScratch.push(spawn.idx[i]);
        else railFlushBatch.add(spawn.idx[i], spawn.side[i], 1, 1);
    let commitBounds = null;
    if (voxelScratch.length || railFlushBatch.count) {
        wallDamage.commit.clearWalls({ voxels: voxelScratch, rails: railFlushBatch });
        commitBounds = wallDamage.commit.flush();
    }
    const spatialFrame = wallDamage.spatialFrame;
    wallDamage.spatialFrame = null;
    const lastSpawned = wallDamage.lastSpawned;
    lastSpawned.length = 0;
    for (let i = 0; i < spawn.count; i++) {
        const shards = state.fractureEngine.spawnFromBreakRow(spawn, i, spatialFrame);
        for (let j = 0; j < shards.length; j++) lastSpawned.push(shards[j]._physId);
    }
    wallDamage.lastCommitBounds = commitBounds;
    wallDamage.lastSpawnedCount = lastSpawned.length;
}
export class FractureEngine {
    constructor(world) {
        this.world = world;
        const geom = new FractureGeomPool();
        this.stores = { geom, debris: new FractureDebrisStore(geom) };
    }
    acquireDebrisProp(type, x, y, facing = 0) {
        let prop = debrisWorldPropPool.pop();
        if (!prop) prop = new WorldProp(x, y, type, facing);
        else {
            clearWorldPropSpawnPose(prop);
            prop._physId = allocateEntityEid();
            prop.initializeSpawn(x, y, type, facing);
        }
        clearWorldPropSpawnPose(prop);
        prop.wallChunkProfileId = undefined;
        prop.wallChunkHeightPx = undefined;
        prop.height = resolveAssetPropHeight(propCatalog[type]);
        return prop;
    }
    releaseDebrisEid(eid, spatialFrame) {
        const prop = entityRefs[eid];
        removeWorldPropEid(this.world, eid, spatialFrame);
        releaseLivePolygon(prop);
        clearWorldPropSpawnPose(prop);
        debrisWorldPropPool.push(prop);
    }
    spawnIntactWallChunk(parent, spatialFrame) {
        const prop = this.acquireDebrisProp(parent.type, parent.x, parent.y, parent.facing);
        prop.vx = parent.vx;
        prop.vy = parent.vy;
        prop.angularVelocity = parent.angularVelocity;
        prop.wallChunkProfileId = parent.wallChunkProfileId;
        prop.wallChunkHeightPx = parent.wallChunkHeightPx;
        prop.height = parent.height;
        copyDebrisPolygonGeometry(prop, parent);
        this.world.entityRegistry.register(ENTITY_KIND_DEBRIS, prop);
        const eid = prop._physId;
        wakeKineticBody(eid);
        admitEidScratch.clear();
        admitEidScratch.push(eid);
        spatialFrame.admitKineticEids(admitEidScratch.buf, admitEidScratch.used, this.world);
        admitEidScratch.clear();
        spawnedScratch.length = 0;
        spawnedScratch.push(prop);
        return spawnedScratch;
    }
    spawnFromBreakRow(spawn, row, spatialFrame) {
        const propType = spawn.kind[row] === WALL_STAMP_VOXEL ? "wall_voxel_chunk" : "wall_rail_chunk";
        const parent = breakSourceScratch;
        parent.type = propType;
        parent.strategy = sharedWorldPropStrategy(propType);
        parent.x = spawn.x[row];
        parent.y = spawn.y[row];
        parent.vx = 0;
        parent.vy = 0;
        parent.angularVelocity = 0;
        parent.facing = spawn.angle[row];
        parent.collisionParts = undefined;
        applyPropBoxFootprint(parent, spawn.width[row] / 2, spawn.height[row] / 2);
        parent.height = spawn.wallHeight[row];
        parent.wallChunkProfileId = spawn.profileId[row];
        parent.wallChunkHeightPx = spawn.wallHeight[row];
        const sourceMass = spawn.sourceMass[row];
        const parentMass = kineticMassFromFootprint(parent);
        const massFactor = sourceMass / (sourceMass + parentMass);
        const speed = Math.max(20, spawn.sourceSpeed[row] * 0.6 * (massFactor * 2));
        parent.vx = -spawn.normalX[row] * speed;
        parent.vy = -spawn.normalY[row] * speed;
        parent.angularVelocity = (deterministicUnitRandom(Math.imul(spawn.idx[row] | 0, 1597334677)) - 0.5) * 2.0;
        ENGINE_F32[F_OUT_MOTION_VX] = parent.vx;
        ENGINE_F32[F_OUT_MOTION_VY] = parent.vy;
        ENGINE_F32[F_OUT_MOTION_W] = parent.angularVelocity;
        const force = FractureEngine.impactForceFromContact(spawn.sourceSpeed[row], sourceMass, parentMass) + FRACTURE_TUNING.wallSpawn.forceBias;
        const ok = FractureEngine.fracturePropOnImpact(parent, spawn.contactX[row], spawn.contactY[row], force, this);
        if (!ok) return this.spawnIntactWallChunk(parent, spatialFrame);
        const stores = this.stores;
        const spawned = this.spawnShardsFromFracture(parent);
        if (!spawned.length) {
            releaseDebrisGeomRange(stores, ENGINE_F32[F_OUT_DEBRIS_START], ENGINE_F32[F_OUT_DEBRIS_COUNT]);
            stores.debris.reset();
            return this.spawnIntactWallChunk(parent, spatialFrame);
        }
        admitEidScratch.clear();
        for (let i = 0; i < spawned.length; i++) admitEidScratch.push(spawned[i]._physId);
        spatialFrame.admitKineticEids(admitEidScratch.buf, admitEidScratch.used, this.world);
        admitEidScratch.clear();
        releaseDebrisGeomRange(stores, ENGINE_F32[F_OUT_DEBRIS_START], ENGINE_F32[F_OUT_DEBRIS_COUNT]);
        stores.debris.reset();
        return spawned;
    }
    spawnShardsFromFracture(sourceProp, deferredRow) {
        const stores = this.stores;
        if (deferredRow !== undefined) {
            const d = deferredFractureSlab;
            ENGINE_F32[F_OUT_DEBRIS_START] = d.debrisStart[deferredRow];
            ENGINE_F32[F_OUT_DEBRIS_COUNT] = d.debrisCount[deferredRow];
            ENGINE_F32[F_OUT_ORIGIN_X] = d.originX[deferredRow];
            ENGINE_F32[F_OUT_ORIGIN_Y] = d.originY[deferredRow];
            ENGINE_F32[F_OUT_FACING] = d.facing[deferredRow];
            ENGINE_F32[F_OUT_IMPACT_LOCAL_X] = d.impactLocalX[deferredRow];
            ENGINE_F32[F_OUT_IMPACT_LOCAL_Y] = d.impactLocalY[deferredRow];
            ENGINE_F32[F_OUT_IMPACT_FORCE] = d.impactForce[deferredRow];
        }
        const debrisStart = ENGINE_F32[F_OUT_DEBRIS_START];
        const debrisCount = ENGINE_F32[F_OUT_DEBRIS_COUNT];
        const originX = ENGINE_F32[F_OUT_ORIGIN_X];
        const originY = ENGINE_F32[F_OUT_ORIGIN_Y];
        const facing = ENGINE_F32[F_OUT_FACING];
        const impactForce = ENGINE_F32[F_OUT_IMPACT_FORCE];
        const cos = Math.cos(facing);
        const sin = Math.sin(facing);
        const motionVx = ENGINE_F32[F_OUT_MOTION_VX];
        const motionVy = ENGINE_F32[F_OUT_MOTION_VY];
        const motionW = ENGINE_F32[F_OUT_MOTION_W];
        const sourceEid = sourceProp._physId;
        const fractureBurst = !(sourceEid != null && entityKind[sourceEid] === ENTITY_KIND_DEBRIS) && effectiveFracture(sourceProp);
        const burstSalt = fractureBurst ? 991 : 0;
        if (fractureBurst) seedFractureRand(originX, originY, impactForce, burstSalt);
        const wallChunkProfileId = sourceProp.wallChunkProfileId;
        const wallChunkHeightPx = sourceProp.wallChunkHeightPx;
        const shardHeight = sourceProp.height;
        const shardType = sourceProp.type;
        const debris = stores.debris;
        spawnedScratch.length = 0;
        for (let i = debrisStart; i < debrisStart + debrisCount; i++) {
            const cx = debris.centroidX[i];
            const cy = debris.centroidY[i];
            const worldX = originX + cx * cos - cy * sin;
            const worldY = originY + cx * sin + cy * cos;
            const prop = this.acquireDebrisProp(shardType, worldX, worldY, facing);
            FractureEngine.applyPropFractureGeometryFromDebris(prop, stores, i);
            stores.geom.release(debris.vertHandle[i]);
            debris.vertHandle[i] = 0;
            prop.vx = motionVx;
            prop.vy = motionVy;
            prop.angularVelocity = motionW;
            prop._fractureCooldown = FRACTURE_TUNING.shared.cooldown;
            prop.fractureEnabled = sourceProp.fractureEnabled;
            if (wallChunkProfileId !== undefined) {
                prop.wallChunkProfileId = wallChunkProfileId;
                prop.wallChunkHeightPx = wallChunkHeightPx;
            }
            if (shardHeight != null) prop.height = shardHeight;
            if (fractureBurst) FractureEngine._applyShardBurstImpulse(prop._physId, cx, cy);
            this.world.entityRegistry.register(ENTITY_KIND_DEBRIS, prop);
            spawnedScratch.push(prop);
        }
        for (let i = 0; i < spawnedScratch.length; i++) wakeKineticBody(spawnedScratch[i]._physId);
        return spawnedScratch;
    }
    integrateSpawned(spatialFrame, eids, dtMs) {
        if (!eids.length || dtMs <= 0) return;
        const integrated = integratedScratch;
        integrated.length = 0;
        for (let i = 0; i < eids.length; i++) {
            const eid = eids[i];
            if ((entityFlags[eid] & ENTITY_FLAG_DEAD) !== 0 || kineticDynamicSlab.sleeping[eid] !== 0) continue;
            applyVelocityDamping(eid, dtMs, primitiveDragFrictionEid(eid));
            integrated.push(eid);
        }
        if (!integrated.length) return;
        spatialFrame.reindexKineticBodies(integrated, integrated.length);
        integrated.length = 0;
    }
    processKineticContactFractures(frame, world, contacts) {
        if (contacts.count === 0) return;
        const slab = kineticDynamicSlab;
        for (let i = 0; i < contacts.count; i++) {
            const physIdA = contacts.physIdA[i];
            const physIdB = contacts.physIdB[i];
            const nx = contacts.dynamic.nx[i];
            const ny = contacts.dynamic.ny[i];
            let hitX;
            let hitY;
            if (contacts.static.tier[i] === KINETIC_PAIR_CIRCLE_CIRCLE) {
                hitX = slab.x[physIdA] - nx * slab.r[physIdA];
                hitY = slab.y[physIdA] - ny * slab.r[physIdA];
            } else {
                hitX = slab.x[physIdA] + contacts.dynamic.rax[i];
                hitY = slab.y[physIdA] + contacts.dynamic.ray[i];
            }
            const relSpeed = Math.hypot(contacts.dynamic.preDvx[i], contacts.dynamic.preDvy[i]);
            const force = FractureEngine.impactForceFromContact(relSpeed, kineticStaticSlab.mass[physIdA], kineticStaticSlab.mass[physIdB]);
            this.queueFractureKineticContact(physIdA, physIdB, hitX, hitY, force, nx, ny);
        }
        this.flushDeferredFractures(world, frame);
    }
    flushDeferredFractures(world, spatialFrame) {
        const deferred = deferredFractureSlab;
        const count = deferred.count;
        if (count === 0) return;
        world.entityRegistry.beginMembershipBatch();
        admitEidScratch.clear();
        const stores = this.stores;
        try {
            for (let i = 0; i < count; i++) {
                const eid = deferred.physId[i];
                const prop = entityRefs[eid];
                entityFlags[eid] &= ~ENTITY_FLAG_PENDING_FRACTURE;
                FractureEngine._currentPropMotion(eid);
                const shards = this.spawnShardsFromFracture(prop, i);
                if (!deferred.remnant[i]) removeLiveKineticEid(world, eid, spatialFrame);
                for (let j = 0; j < shards.length; j++) admitEidScratch.push(shards[j]._physId);
                releaseDebrisGeomRange(stores, deferred.debrisStart[i], deferred.debrisCount[i]);
            }
            if (admitEidScratch.used) spatialFrame.admitKineticEids(admitEidScratch.buf, admitEidScratch.used, world);
        } finally {
            world.entityRegistry.endMembershipBatch();
            stores.debris.reset();
            deferredFractureSlab.count = 0;
            admitEidScratch.clear();
        }
    }
    queueFractureKineticContact(eidA, eidB, hitX, hitY, force, nx = 0, ny = 0) {
        let bestEid = undefined;
        let bestExcess = -Infinity;
        let bestArea = Infinity;
        for (let i = 0; i < 2; i++) {
            const eid = i === 0 ? eidA : eidB;
            const fractureConfig = effectiveFractureEid(eid);
            if (!fractureConfig) continue;
            if (!FractureEngine.canFracturePropSplitEid(eid)) continue;
            if (entityFractureCooldown[eid] > 0) continue;
            if ((entityFlags[eid] & ENTITY_FLAG_PENDING_FRACTURE) !== 0) continue;
            const baseThreshold = fractureConfig.minForce ?? FRACTURE_IMPACT_THRESHOLD;
            const excess = force - requiredImpactForce(eid, baseThreshold);
            if (excess < 0) continue;
            const area = FractureEngine._fractureFootprintAreaEid(eid);
            if (excess > bestExcess || (excess === bestExcess && area < bestArea)) {
                bestExcess = excess;
                bestArea = area;
                bestEid = eid;
            }
        }
        if (bestEid === undefined) return;
        const bestProp = entityRefs[bestEid];
        if (!FractureEngine.fracturePropOnImpact(bestProp, hitX, hitY, force, this)) return;
        if (ENGINE_F32[F_OUT_REMNANT] !== 1) entityFlags[bestEid] |= ENTITY_FLAG_PENDING_FRACTURE;
        const deferred = deferredFractureSlab;
        const count = deferred.count;
        deferred.physId[count] = bestEid;
        deferred.debrisStart[count] = ENGINE_F32[F_OUT_DEBRIS_START];
        deferred.debrisCount[count] = ENGINE_F32[F_OUT_DEBRIS_COUNT];
        deferred.originX[count] = ENGINE_F32[F_OUT_ORIGIN_X];
        deferred.originY[count] = ENGINE_F32[F_OUT_ORIGIN_Y];
        deferred.impactLocalX[count] = ENGINE_F32[F_OUT_IMPACT_LOCAL_X];
        deferred.impactLocalY[count] = ENGINE_F32[F_OUT_IMPACT_LOCAL_Y];
        deferred.impactForce[count] = ENGINE_F32[F_OUT_IMPACT_FORCE];
        deferred.facing[count] = ENGINE_F32[F_OUT_FACING];
        deferred.remnant[count] = ENGINE_F32[F_OUT_REMNANT] === 1 ? 1 : 0;
        deferred.count = count + 1;
    }
    static commitFractureResult(world, prop, spatialFrame) {
        const remnant = ENGINE_F32[F_OUT_REMNANT] === 1;
        const stores = world.fractureEngine.stores;
        const sourceEid = prop._physId;
        FractureEngine._currentPropMotion(sourceEid);
        const shards = world.fractureEngine.spawnShardsFromFracture(prop);
        if (!remnant) removeLiveKineticEid(world, sourceEid, spatialFrame);
        if (shards.length) {
            admitEidScratch.clear();
            for (let i = 0; i < shards.length; i++) admitEidScratch.push(shards[i]._physId);
            spatialFrame.admitKineticEids(admitEidScratch.buf, admitEidScratch.used, world);
            admitEidScratch.clear();
        }
        releaseDebrisGeomRange(stores, ENGINE_F32[F_OUT_DEBRIS_START], ENGINE_F32[F_OUT_DEBRIS_COUNT]);
        stores.debris.reset();
        return shards;
    }
    static _appendIntactPolygonIntoStore(stores, flatVerts) {
        const vertCount = flatVerts.length >> 1;
        if (vertCount < 3) return;
        const handle = stores.geom.borrow(vertCount);
        stores.geom.copyVerts(handle, flatVerts, vertCount);
        stores.debris.appendCenteredPolygon(handle, vertCount);
    }
    static fracturePropOnImpact(prop, worldHitX, worldHitY, impactForce, engine) {
        const stores = engine.stores;
        if (deferredFractureSlab.count === 0) stores.debris.reset();
        if (!effectiveFracture(prop)) return false;
        if (!FractureEngine.canFracturePropSplit(prop)) return false;
        const originX = prop.x;
        const originY = prop.y;
        const dx = worldHitX - originX;
        const dy = worldHitY - originY;
        const facing = prop.facing;
        const cos = Math.cos(facing);
        const sin = Math.sin(facing);
        const impactLocalX = dx * cos + dy * sin;
        const impactLocalY = -dx * sin + dy * cos;
        seedFractureRand(worldHitX, worldHitY, impactForce);
        ENGINE_F32[F_OUT_REMNANT] = 0;
        const parts = collisionPartsList(prop);
        if (parts) {
            const hitCount = markHitCompoundParts(parts, impactLocalX, impactLocalY);
            if (hitCount === 0) return false;
            const batchStart = stores.debris.write;
            for (let i = 0; i < parts.length; i++)
                if (ENGINE_U8[i]) FractureEngine._shatterPolygonIntoStore(stores, parts[i].vertices, impactLocalX, impactLocalY, impactForce);
                else FractureEngine._appendIntactPolygonIntoStore(stores, parts[i].vertices);
            ENGINE_F32[F_OUT_DEBRIS_START] = batchStart;
            ENGINE_F32[F_OUT_DEBRIS_COUNT] = stores.debris.write - batchStart;
            if (ENGINE_F32[F_OUT_DEBRIS_COUNT] < 2) return false;
        } else {
            FractureEngine._shatterPolygonIntoStore(stores, prop.shape.vertices, impactLocalX, impactLocalY, impactForce);
            if (ENGINE_F32[F_OUT_DEBRIS_COUNT] < 2) return false;
        }
        ENGINE_F32[F_OUT_ORIGIN_X] = originX;
        ENGINE_F32[F_OUT_ORIGIN_Y] = originY;
        ENGINE_F32[F_OUT_FACING] = facing;
        ENGINE_F32[F_OUT_IMPACT_LOCAL_X] = impactLocalX;
        ENGINE_F32[F_OUT_IMPACT_LOCAL_Y] = impactLocalY;
        ENGINE_F32[F_OUT_IMPACT_FORCE] = impactForce;
        return true;
    }
    static impactForceFromContact(relativeSpeed, massA = 1, massB = 1) {
        return relativeSpeed * 0.5 + Math.sqrt(massA * massB) * 0.3;
    }
    static applyPropFractureGeometry(prop, geometry) {
        prop.collisionParts = undefined;
        const src = geometry.footprintVertices;
        const n = src.length;
        writeLivePolygon(prop, src, n);
        prop.footprintArea = geometry.footprintArea;
        prop.radius = geometry.boundingRadius;
        invalidateEntityFootprint(prop._physId);
        normalizeKineticBody(prop);
    }
    static applyPropFractureGeometryFromDebris(prop, stores, debrisIndex) {
        const debris = stores.debris;
        const handle = debris.vertHandle[debrisIndex];
        const vertCount = debris.vertCount[debrisIndex];
        const src = stores.geom.buffer(handle);
        const n = vertCount * 2;
        writeLivePolygon(prop, src, n);
        prop.collisionParts = undefined;
        prop.footprintArea = debris.footprintArea[debrisIndex];
        prop.radius = debris.boundingRadius[debrisIndex];
        invalidateEntityFootprint(prop._physId);
        normalizeKineticBody(prop);
    }
    static propFractureSpan(eid) {
        const hx = kineticDynamicSlab.hx[eid];
        const hy = kineticDynamicSlab.hy[eid];
        return Math.max(hx, hy) * 2;
    }
    static propFractureSpanFromShape(prop) {
        const parts = collisionPartsList(prop);
        if (parts) {
            let maxSpan = 0;
            for (let i = 0; i < parts.length; i++) {
                const shape = parts[i];
                if (shape.shapeTypeId !== SHAPE_TYPE_POLYGON) continue;
                convexFootprintHalfExtents(ENGINE_F32, F_VEC_A, shape.vertices);
                maxSpan = Math.max(maxSpan, Math.max(ENGINE_F32[F_VEC_A], ENGINE_F32[F_VEC_A + 1]) * 2);
            }
            return maxSpan;
        }
        const shape = prop.shape;
        if (shape.shapeTypeId !== SHAPE_TYPE_POLYGON) return 0;
        convexFootprintHalfExtents(ENGINE_F32, F_VEC_A, shape.vertices);
        return Math.max(ENGINE_F32[F_VEC_A], ENGINE_F32[F_VEC_A + 1]) * 2;
    }
    static canFracturePropSplitEid(eid, minSize = FRACTURE_MIN_PIECE_SIZE) {
        if (!effectiveFractureEid(eid)) return false;
        if (FractureEngine.propFractureSpan(eid) < minSize) return false;
        const area = FractureEngine._fractureFootprintAreaEid(eid);
        const minArea = Math.max(FRACTURE_MIN_SHARD_AREA, area / FRACTURE_MAX_SHARDS_PER_SHATTER) * 2;
        return area >= minArea;
    }
    static canFracturePropSplit(prop, minSize = FRACTURE_MIN_PIECE_SIZE) {
        if (!effectiveFracture(prop)) return false;
        const parts = collisionPartsList(prop);
        if (parts) {
            let refVerts = null;
            for (let i = 0; i < parts.length; i++) {
                const shape = parts[i];
                if (shape.shapeTypeId !== SHAPE_TYPE_POLYGON) continue;
                refVerts = shape.vertices;
                break;
            }
            if (!refVerts || FractureEngine.propFractureSpanFromShape(prop) < minSize) return false;
            const minArea = FractureEngine.minShardAreaForPolygon(refVerts) * 2;
            return FractureEngine._fractureFootprintArea(prop) >= minArea;
        }
        const shape = prop.shape;
        if (shape.shapeTypeId !== SHAPE_TYPE_POLYGON) return false;
        if (FractureEngine.propFractureSpanFromShape(prop) < minSize) return false;
        const minArea = FractureEngine.minShardAreaForPolygon(shape.vertices) * 2;
        return FractureEngine._fractureFootprintArea(prop) >= minArea;
    }
    static _shatterPolygonIntoStore(stores, flatVerts, hitX, hitY, impactForce) {
        let seedCount = FractureEngine._seedCountForPolygon(flatVerts, impactForce);
        FractureEngine._buildShatterSeeds(flatVerts, hitX, hitY, seedCount, SHATTER_SEEDS);
        const vertCount = flatVerts.length / 2;
        const debrisStart = stores.debris.write;
        let attempts = 0;
        while (attempts < 10 && seedCount > 1) {
            let dropIndex = -1;
            for (let i = 0; i < seedCount; i++) {
                stores.geom.voronoiCellIntoEngine(flatVerts, vertCount, SHATTER_SEEDS, i, seedCount);
                const cellHandle = ENGINE_F32[F_OUT_VORONOI_HANDLE];
                const cellVerts = ENGINE_F32[F_OUT_VORONOI_VERTS];
                if (cellVerts < 3) {
                    if (cellHandle) stores.geom.release(cellHandle);
                    dropIndex = i;
                    break;
                }
                stores.debris.appendCenteredPolygon(cellHandle, cellVerts);
                if (ENGINE_F32[F_OUT_AREA] < FRACTURE_MIN_SHARD_AREA) {
                    stores.debris.write--;
                    stores.geom.release(cellHandle);
                    stores.debris.vertHandle[stores.debris.write] = 0;
                    dropIndex = i;
                    break;
                }
            }
            if (dropIndex < 0) {
                ENGINE_F32[F_OUT_DEBRIS_START] = debrisStart;
                ENGINE_F32[F_OUT_DEBRIS_COUNT] = stores.debris.write - debrisStart;
                return;
            }
            releaseDebrisGeomRange(stores, debrisStart, stores.debris.write - debrisStart);
            stores.debris.write = debrisStart;
            seedCount = dropShatterSeed(SHATTER_SEEDS, dropIndex, seedCount);
            attempts++;
        }
        ENGINE_F32[F_OUT_DEBRIS_START] = debrisStart;
        for (let i = 0; i < seedCount; i++) {
            stores.geom.voronoiCellIntoEngine(flatVerts, vertCount, SHATTER_SEEDS, i, seedCount);
            const cellHandle = ENGINE_F32[F_OUT_VORONOI_HANDLE];
            const cellVerts = ENGINE_F32[F_OUT_VORONOI_VERTS];
            if (cellVerts < 3) {
                if (cellHandle) stores.geom.release(cellHandle);
                continue;
            }
            stores.debris.appendCenteredPolygon(cellHandle, cellVerts);
            if (ENGINE_F32[F_OUT_AREA] < FRACTURE_MIN_SHARD_AREA) {
                stores.debris.write--;
                stores.geom.release(cellHandle);
                stores.debris.vertHandle[stores.debris.write] = 0;
            }
        }
        ENGINE_F32[F_OUT_DEBRIS_COUNT] = stores.debris.write - debrisStart;
    }
    static _buildShatterSeeds(flatVerts, hitX, hitY, seedCount, outSeeds) {
        polygonCentroid2DInto(F_VEC_A, flatVerts);
        const cx = ENGINE_F32[F_VEC_A];
        const cy = ENGINE_F32[F_VEC_A + 1];
        let ox = hitX;
        let oy = hitY;
        if (!pointInPolygon(ox, oy, flatVerts)) {
            FractureEngine._closestPointOnPolygonBoundary(ox, oy, flatVerts);
            ox = ENGINE_F32[F_OUT_CLOSEST_X] + (cx - ENGINE_F32[F_OUT_CLOSEST_X]) * 0.15;
            oy = ENGINE_F32[F_OUT_CLOSEST_Y] + (cy - ENGINE_F32[F_OUT_CLOSEST_Y]) * 0.15;
        }
        const span = FractureEngine._polygonSpan(flatVerts);
        const golden = 2.399963229728653;
        outSeeds[0] = ox;
        outSeeds[1] = oy;
        for (let i = 1; i < seedCount; i++) {
            const r = span * 0.62 * Math.sqrt(i / seedCount) * (0.85 + 0.3 * nextFractureRand());
            const a = i * golden + (nextFractureRand() - 0.5) * 0.5;
            outSeeds[i * 2] = ox + Math.cos(a) * r;
            outSeeds[i * 2 + 1] = oy + Math.sin(a) * r;
        }
    }
    static _seedCountForPolygon(flatVerts, impactForce) {
        const area = Math.abs(polygonSignedArea2D(flatVerts));
        const span = FractureEngine._polygonSpan(flatVerts);
        const minArea = FractureEngine.minShardAreaForPolygon(flatVerts);
        const areaCap = Math.max(2, Math.floor(area / minArea));
        const minShardsAllowed = Math.min(4, areaCap);
        let count = Math.max(minShardsAllowed, Math.min(FRACTURE_MAX_SHARDS_PER_SHATTER, Math.round(span / 12) + Math.floor(impactForce * 0.03)));
        return Math.min(count, areaCap);
    }
    static measureFractureShard(flatVerts) {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        const count = flatVerts.length / 2;
        for (let i = 0; i < count; i++) {
            const x = flatVerts[i * 2];
            const y = flatVerts[i * 2 + 1];
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
        const thick = Math.max(maxX - minX, maxY - minY);
        const thin = Math.min(maxX - minX, maxY - minY);
        return { area: Math.abs(polygonSignedArea2D(flatVerts)), thin, thick, aspect: thick / Math.max(1e-6, thin) };
    }
    static minShardAreaForPolygon(flatVerts) {
        const area = Math.abs(polygonSignedArea2D(flatVerts));
        return Math.max(FRACTURE_MIN_SHARD_AREA, area / FRACTURE_MAX_SHARDS_PER_SHATTER);
    }
    static _polygonSpan(flatVerts) {
        let minX = flatVerts[0],
            maxX = flatVerts[0];
        let minY = flatVerts[1],
            maxY = flatVerts[1];
        const count = flatVerts.length / 2;
        for (let i = 1; i < count; i++) {
            const x = flatVerts[i * 2];
            const y = flatVerts[i * 2 + 1];
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
        return Math.max(maxX - minX, maxY - minY);
    }
    static _closestPointOnPolygonBoundary(x, y, flatVerts) {
        let bestX = flatVerts[0];
        let bestY = flatVerts[1];
        let bestDistSq = Infinity;
        const count = flatVerts.length / 2;
        for (let i = 0; i < count; i++) {
            const j = (i + 1) % count;
            const ax = flatVerts[i * 2];
            const ay = flatVerts[i * 2 + 1];
            const bx = flatVerts[j * 2];
            const by = flatVerts[j * 2 + 1];
            const dx = bx - ax;
            const dy = by - ay;
            let t = dx === 0 && dy === 0 ? 0 : ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy);
            t = Math.max(0, Math.min(1, t));
            const cx = ax + t * dx;
            const cy = ay + t * dy;
            const distSq = (x - cx) * (x - cx) + (y - cy) * (y - cy);
            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                bestX = cx;
                bestY = cy;
            }
        }
        ENGINE_F32[F_OUT_CLOSEST_X] = bestX;
        ENGINE_F32[F_OUT_CLOSEST_Y] = bestY;
    }
    static _fractureFootprintArea(prop) {
        if (prop.footprintArea != null) return prop.footprintArea;
        return kineticFootprintArea(prop);
    }
    static _fractureFootprintAreaEid(eid) {
        const hx = kineticDynamicSlab.hx[eid];
        const hy = kineticDynamicSlab.hy[eid];
        return 4 * hx * hy;
    }
    static _currentPropMotion(eid) {
        ENGINE_F32[F_OUT_MOTION_VX] = entityVx[eid];
        ENGINE_F32[F_OUT_MOTION_VY] = entityVy[eid];
        ENGINE_F32[F_OUT_MOTION_W] = entityW[eid];
    }
    static _applyShardBurstImpulse(eid, cx, cy) {
        const originX = ENGINE_F32[F_OUT_ORIGIN_X];
        const originY = ENGINE_F32[F_OUT_ORIGIN_Y];
        const facing = ENGINE_F32[F_OUT_FACING];
        const impactLocalX = ENGINE_F32[F_OUT_IMPACT_LOCAL_X];
        const impactLocalY = ENGINE_F32[F_OUT_IMPACT_LOCAL_Y];
        const impactForce = ENGINE_F32[F_OUT_IMPACT_FORCE];
        const cos = Math.cos(facing);
        const sin = Math.sin(facing);
        const impactWorldX = originX + impactLocalX * cos - impactLocalY * sin;
        const impactWorldY = originY + impactLocalX * sin + impactLocalY * cos;
        const burst = Math.min(FRACTURE_TUNING.burst.maxBurst, FRACTURE_TUNING.burst.baseBurst + impactForce * FRACTURE_TUNING.burst.burstForceScale);
        const worldPosX = originX + cx * cos - cy * sin;
        const worldPosY = originY + cx * sin + cy * cos;
        const dx = worldPosX - impactWorldX;
        const dy = worldPosY - impactWorldY;
        const dist = Math.hypot(dx, dy);
        if (dist > 1e-6) {
            entityVx[eid] += (dx / dist) * burst;
            entityVy[eid] += (dy / dist) * burst;
        }
        entityW[eid] += (nextFractureRand() - 0.5) * FRACTURE_TUNING.burst.spinScale;
        entityFractureCooldown[eid] = FRACTURE_TUNING.shared.cooldown;
    }
}
