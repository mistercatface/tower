import { withSeededRandom } from "../Random/index.js";
import { invalidateGridLocalNavBake, CorridorPathfinder, getNavWalkableCellIndex, patchNavWalkableCellIndex } from "../Navigation/navigation.js";
import { CARDINAL_DCOL, CARDINAL_DR, minCornerAabbF32, CARDINAL_FACING_STEPS, lengthXY, boxLocalFootprint, vertCount, createSeededRng, centerReachAabbF32, centeredAabbF32, padAabbF32, unionAabbF32 } from "../Math/math.js";
import { ENGINE_F32, ENGINE_I32, ENGINE_BOUNDS_BASE, B_PAD, B_CELL, B_TMP, B_FOOTPRINT, S_OUT_XY, S_OUT_SCREEN, S_EDGE_P1X, S_EDGE_P1Y, S_EDGE_P2X, S_EDGE_P2Y, S_OUT_RAY_X, S_OUT_RAY_Y, S_OUT_RAY_DIST, I_OUT_RAY_HIT, P_VEC_A, kineticDynamicSlab, entityRefs, entityFlags, entityX, entityY, entityR, entitySpatialGen, entityGridTileIdx, entityAlive, entityNext, ensureGrowI32, GrowI32, staticWallSegmentSlab, resetStaticWallSegmentSlab, allocStaticWallSegment, packStaticWallSegKey, lookupStaticWallSegIntern, insertStaticWallSegIntern, MAX_STATIC_WALL_SEGMENTS } from "../../Core/engineMemory.js";
import { GRID_NAV_EPOCH_WALL, GRID_NAV_EPOCH_FLOOR, GRID_NAV_EPOCH_TOPOLOGY, GRID_NAV_EPOCH_COUNT, WALL_SEG_VOXEL, WALL_SEG_EDGE_RAIL, WALL_SEG_STATIC_FACE, CIRCLE_RAY_HIT_NONE, CIRCLE_RAY_HIT_WALL } from "../../Core/engineEnums.js";
import { neighborQueryPadForExtent, circleLeadingPoint, minDistanceSegmentToWall, circleIntersectsSegment, CircleShape, PolygonShape, wakeKineticBody, bumpKineticTopologyGeneration, normalizeKineticBody, invalidateKineticShapeGeom, slabCollisionSpan, refreshActiveKineticBodySlabPose, invalidateKineticSlabSlot, clearActiveKineticBodySlab, appendActiveKineticBodySlabPhysId, primitiveDragFrictionEid } from "../Physics/physics.js";
import { SparseBucketGrid } from "../DataStructures/SparseBucketGrid.js";
import { MAX_ENTITIES } from "../../Core/engineLimits.js";
import { clampStampWallHeightLevel } from "../WorldSurface/worldSurface.js";
import { rebuildLabMapCaches } from "../Render/render.js";
import { BeltPacked, CorridorBeltSession } from "./belts.js";
import { PortalLink } from "./portals.js";
import { ENTITY_KIND_DEBRIS, ENTITY_KIND_WORLD_PROP, ENTITY_FLAG_KINETIC } from "../../Core/engineEnums.js";
import { allocateEntityEid, releaseEntityEid, noteEntityEidHighWater, bindEntitySlot, clearWorldPropSpawnPose, worldPropBindFlags } from "../../Core/entitySlots.js";
export function gridSideFromCellToNeighbor(c, r, nc, nr) {
    const dc = nc - c;
    const dr = nr - r;
    if (dc === 0 && dr === -1) return 0;
    if (dc === 1 && dr === 0) return 1;
    if (dc === 0 && dr === 1) return 2;
    if (dc === -1 && dr === 0) return 3;
    throw new Error(`gridSideFromCellToNeighbor: non-cardinal step ${dc},${dr}`);
}
const EMPTY_WALL_CANDIDATES = new GrowI32(0);
/**
 * Duck-typed per-tick spatial frame: entity grid, wall segment cache.
 * Game adapters call resetFrame / insertEid then run pair policies.
 */
export class SpatialFrameCore {
    constructor(cellSize = 50) {
        this.entityGrid = new EntityGrid(cellSize);
        this.frameId = 0;
        this._wallBuckets = createWallCandidateBucketSlab();
        this._wallBucketRevision = -1;
        this._obstacleGrid = null;
    }
    resetFrame(obstacleGrid) {
        this.frameId = (this.frameId + 1) | 0;
        invalidateWallCandidateBucketFrame(this._wallBuckets);
        this._obstacleGrid = obstacleGrid?.appendStaticWallSegmentsNearWorld ? obstacleGrid : null;
        resetStaticWallSegmentSlab();
        this.entityGrid.syncBounds(obstacleGrid);
        this.entityGrid.clear();
    }
    _ensureWallBucketCacheRevision(grid) {
        const revision = grid.wallGridRevision;
        if (this._wallBucketRevision === revision) return;
        resetWallCandidateBucketSlab(this._wallBuckets);
        resetStaticWallSegmentSlab();
        this._wallBucketRevision = revision;
    }
    getWallCandidates(eid) {
        if (!this._obstacleGrid) return EMPTY_WALL_CANDIDATES;
        const grid = this._obstacleGrid;
        this._ensureWallBucketCacheRevision(grid);
        const worldX = kineticDynamicSlab.x[eid];
        const worldY = kineticDynamicSlab.y[eid];
        const queryRadius = slabCollisionSpan(eid);
        wallBucketKeyPartsInto(sWallBucketKey, 0, grid, worldX, worldY, queryRadius);
        const keyLo = sWallBucketKey[0];
        const keyHi = sWallBucketKey[1];
        const revision = grid.wallGridRevision;
        const segIds = lookupWallCandidateBucketInto(sWallBucketHitSlot, this._wallBuckets, keyLo, keyHi, this.frameId, revision);
        if (sWallBucketHitSlot[0]) return segIds;
        grid.appendStaticWallSegmentsNearWorld(worldX, worldY, queryRadius, segIds);
        commitWallCandidateBucket(this._wallBuckets, sWallBucketHitSlot[1], keyLo, keyHi, this.frameId, revision, segIds);
        return segIds;
    }
    insertEid(eid) {
        noteEntityEidHighWater(eid);
        this.entityGrid.insert(eid);
    }
    reindexKineticBodies(bodies) {
        if (!bodies?.length) return;
        for (let i = 0; i < bodies.length; i++) {
            const eid = bodies[i]._physId;
            this.entityGrid.remove(eid);
            this.entityGrid.insert(eid);
        }
        this.frameId = (this.frameId + 1) | 0;
        invalidateWallCandidateBucketFrame(this._wallBuckets);
    }
    collectEntityEidsInBoundsF32(buf, o, outEids, outStart, outCap, excludeEid = -1) {
        return this.entityGrid.collectEidsInBoundsF32(buf, o, outEids, outStart, outCap, excludeEid);
    }
}
function idxCol(idx, cols) {
    return idx % cols;
}
function idxRow(idx, cols) {
    return (idx / cols) | 0;
}
export function edgeNeighborIdx(idx, side, grid) {
    const cols = grid.cols;
    const rows = grid.rows;
    const col = idxCol(idx, cols);
    const row = idxRow(idx, cols);
    const nc = col + CARDINAL_DCOL[side];
    const nr = row + CARDINAL_DR[side];
    if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) return -1;
    return nr * cols + nc;
}
export function edgeMirrorSide(side) {
    return (side + 2) % 4;
}
export function cellEdgeEndpointsIdx(grid, idx, side, buf, o1, o2, inset = 0) {
    const cols = grid.cols;
    const minX = grid.minX + (idx % cols) * grid.cellSize;
    const minY = grid.minY + ((idx / cols) | 0) * grid.cellSize;
    const maxX = minX + grid.cellSize;
    const maxY = minY + grid.cellSize;
    if (side === 0) {
        buf[o1] = minX;
        buf[o1 + 1] = minY + inset;
        buf[o2] = maxX;
        buf[o2 + 1] = minY + inset;
    } else if (side === 1) {
        buf[o1] = maxX - inset;
        buf[o1 + 1] = minY;
        buf[o2] = maxX - inset;
        buf[o2 + 1] = maxY;
    } else if (side === 2) {
        buf[o1] = minX;
        buf[o1 + 1] = maxY - inset;
        buf[o2] = maxX;
        buf[o2 + 1] = maxY - inset;
    } else {
        buf[o1] = minX + inset;
        buf[o1 + 1] = minY;
        buf[o2] = minX + inset;
        buf[o2 + 1] = maxY;
    }
}
export function edgeRailEmitOwner(grid, idx, side) {
    if (side === 2 || side === 1) return true;
    if (side === 0) return idx < grid.cols;
    return idx % grid.cols === 0;
}
export function railWallEdgeAt(grid, idx, side) {
    if (idx < 0 || idx >= grid.cols * grid.rows) return null;
    return grid.getCellEdge(idx, side);
}
export function railWallEdgeShouldEmit(grid, idx, side) {
    if (!railWallEdgeAt(grid, idx, side)) return false;
    return edgeRailEmitOwner(grid, idx, side);
}
export function edgeRailCollisionThicknessPx(grid, idx, side) {
    const railEdge = railWallEdgeAt(grid, idx, side);
    return railWallThicknessPx(railEdge);
}
export function neighborFillLevel(grid, idx, side) {
    const nIdx = edgeNeighborIdx(idx, side, grid);
    if (nIdx === -1) return 0;
    return grid.grid[nIdx];
}
export function cellIsStaticWallAtIdx(grid, idx) {
    return grid.grid[idx] !== 0;
}
export function resolveCellWallHeightAtIdx(grid, idx) {
    const level = grid.grid[idx];
    if (level === 0) return 0;
    return level * grid.cellSize;
}
export function cellIsStaticWall(grid, idx) {
    if (idx < 0 || idx >= grid.cols * grid.rows) return false;
    return grid.grid[idx] !== 0;
}
function pushExposedWallEdgesForCell(grid, idx, out) {
    const level = grid.grid[idx];
    if (level === 0) return;
    const wallTopZ = resolveCellWallHeightAtIdx(grid, idx);
    for (let side = 0; side < 4; side++) {
        const nIdx = edgeNeighborIdx(idx, side, grid);
        let neighborLevel = 0;
        if (nIdx !== -1) neighborLevel = grid.grid[nIdx];
        if (neighborLevel >= level) continue;
        if (railWallEdgeAt(grid, idx, side)) continue;
        cellEdgeEndpointsIdx(grid, idx, side, ENGINE_F32, S_EDGE_P1X, S_EDGE_P2X, 0);
        out.add(ENGINE_F32[S_EDGE_P1X], ENGINE_F32[S_EDGE_P1Y], ENGINE_F32[S_EDGE_P2X], ENGINE_F32[S_EDGE_P2Y], GRID_SIDE_NX[side], GRID_SIDE_NY[side], wallTopZ);
    }
}
/** Perimeter edges where a filled wall cell meets lower or empty neighbor. */
export function collectExposedWallEdges(grid, out) {
    out.clear();
    const cellCount = grid.cols * grid.rows;
    for (let idx = 0; idx < cellCount; idx++) pushExposedWallEdgesForCell(grid, idx, out);
}
/** Same as collectExposedWallEdges but only visits wall cells overlapping the world AABB. */
export function collectExposedWallEdgesInAabbF32(grid, buf, o, out) {
    forEachObstacleGridCellInAabbF32(grid, buf, o, (idx) => {
        pushExposedWallEdgesForCell(grid, idx, out);
    });
}
export function packEdgeCellKeyByIdx(grid, idx, side) {
    const cols = grid.cols;
    const gc = Math.floor((grid.minX + (idx % cols) * grid.cellSize) / grid.cellSize);
    const gr = Math.floor((grid.minY + ((idx / cols) | 0) * grid.cellSize) / grid.cellSize);
    return gc + gr * 65536 + (side + 1) * 4294967296;
}
export function canonicalEdgeCellKeyIdx(grid, idx, side) {
    const keyA = packEdgeCellKeyByIdx(grid, idx, side);
    const nIdx = edgeNeighborIdx(idx, side, grid);
    if (nIdx === -1) return keyA;
    const keyB = packEdgeCellKeyByIdx(grid, nIdx, edgeMirrorSide(side));
    return keyA <= keyB ? keyA : keyB;
}
export function isCanonicalEdgeRepresentativeIdx(grid, idx, side) {
    return packEdgeCellKeyByIdx(grid, idx, side) === canonicalEdgeCellKeyIdx(grid, idx, side);
}
function forEachCellInColRowBounds(startCol, endCol, startRow, endRow, cols, fn) {
    for (let r = startRow; r <= endRow; r++) {
        const rowOffset = r * cols;
        for (let c = startCol; c <= endCol; c++) if (fn(c, r, rowOffset + c) === false) return false;
    }
}
export function forEachCellEdge(grid, fn, { canonicalOnly = false, minCol, maxCol, minRow, maxRow, filter } = {}) {
    if (!grid.cols) return;
    const startCol = minCol ?? 0;
    const endCol = maxCol ?? grid.cols - 1;
    const startRow = minRow ?? 0;
    const endRow = maxRow ?? grid.rows - 1;
    forEachCellInColRowBounds(startCol, endCol, startRow, endRow, grid.cols, (c, r, cellIdx) => {
        for (let side = 0; side < 4; side++) {
            if (canonicalOnly && !isCanonicalEdgeRepresentativeIdx(grid, cellIdx, side)) continue;
            const edge = grid.getCellEdge(cellIdx, side);
            if (!edge) continue;
            if (filter && !filter(edge)) continue;
            if (fn(cellIdx, side, edge) === false) return false;
        }
    });
}
export function worldColAtOrigin(x, minX, cellSize) {
    return Math.floor((x - minX) / cellSize);
}
export function worldRowAtOrigin(y, minY, cellSize) {
    return Math.floor((y - minY) / cellSize);
}
export function gridCenterXAtOrigin(col, minX, cellHalfSize) {
    return minX + col * (cellHalfSize * 2) + cellHalfSize;
}
export function gridCenterYAtOrigin(row, minY, cellHalfSize) {
    return minY + row * (cellHalfSize * 2) + cellHalfSize;
}
export function cellToChunkCoord(cell, cellsPerChunk) {
    return Math.floor(cell / cellsPerChunk);
}
const CHUNK_KEY_STRIDE = 0x400000;
function zigzagChunk(n) {
    return n >= 0 ? n * 2 : n * -2 - 1;
}
function unzigzagChunk(u) {
    return u & 1 ? -(u + 1) / 2 : u / 2;
}
export function packChunkKey(axis0, axis1) {
    return zigzagChunk(axis0) * CHUNK_KEY_STRIDE + zigzagChunk(axis1);
}
export function chunkKeyAxis0(key) {
    const packed = Math.floor(key / CHUNK_KEY_STRIDE);
    return unzigzagChunk(packed);
}
export function chunkKeyAxis1(key) {
    const packed = key % CHUNK_KEY_STRIDE;
    return unzigzagChunk(packed);
}
export function cellIdxToChunkKey(idx, grid, cellsPerChunk) {
    const cols = grid.cols;
    return packChunkKey(cellToChunkCoord(idx % cols, cellsPerChunk), cellToChunkCoord((idx / cols) | 0, cellsPerChunk));
}
export function forEachChunkKeyInCellBounds(cellBounds, cellsPerChunk, fn) {
    if (!cellsPerChunk || cellsPerChunk <= 0) return;
    const startAxis0 = cellToChunkCoord(cellBounds.startCol, cellsPerChunk);
    const endAxis0 = cellToChunkCoord(cellBounds.endCol, cellsPerChunk);
    const startAxis1 = cellToChunkCoord(cellBounds.startRow, cellsPerChunk);
    const endAxis1 = cellToChunkCoord(cellBounds.endRow, cellsPerChunk);
    for (let axis1 = startAxis1; axis1 <= endAxis1; axis1++) for (let axis0 = startAxis0; axis0 <= endAxis0; axis0++) fn(packChunkKey(axis0, axis1));
}
export function forEachChunkKeyInRange(startKey, endKey, fn) {
    const startAxis0 = chunkKeyAxis0(startKey);
    const endAxis0 = chunkKeyAxis0(endKey);
    const startAxis1 = chunkKeyAxis1(startKey);
    const endAxis1 = chunkKeyAxis1(endKey);
    for (let axis1 = startAxis1; axis1 <= endAxis1; axis1++) for (let axis0 = startAxis0; axis0 <= endAxis0; axis0++) fn(packChunkKey(axis0, axis1));
}
export function cellBoundsFromStampScalars(originIdx, gridCols, gridRows, strideCols, cellCount) {
    const baseCol = originIdx % gridCols;
    const baseRow = (originIdx / gridCols) | 0;
    const cols = strideCols;
    const rows = cellCount / strideCols;
    return { startCol: Math.max(0, baseCol), endCol: Math.min(gridCols - 1, baseCol + cols - 1), startRow: Math.max(0, baseRow), endRow: Math.min(gridRows - 1, baseRow + rows - 1) };
}
export function chunkKeyBounds(buf, o, gridMinX, gridMinY, chunkKey, chunkSizePx) {
    minCornerAabbF32(buf, o, gridMinX + chunkKeyAxis0(chunkKey) * chunkSizePx, gridMinY + chunkKeyAxis1(chunkKey) * chunkSizePx, chunkSizePx, chunkSizePx);
}
export function createCenteredGridFrame(cellSize, width, height, centerX = 0, centerY = 0) {
    const cols = Math.ceil(width / cellSize);
    const rows = Math.ceil(height / cellSize);
    return { cellSize, width, height, cols, rows, offsetX: width / 2, offsetY: height / 2, centerX, centerY };
}
export function setCenteredGridFrameCenter(frame, centerX, centerY) {
    frame.centerX = centerX;
    frame.centerY = centerY;
    return frame;
}
export function centeredGridFrameKey(frame) {
    return `${frame.cols}:${frame.rows}:${frame.cellSize}:${frame.centerX}:${frame.centerY}`;
}
export function worldColInCenteredFrame(frame, x) {
    return Math.floor((x - frame.centerX + frame.offsetX) / frame.cellSize);
}
export function worldRowInCenteredFrame(frame, y) {
    return Math.floor((y - frame.centerY + frame.offsetY) / frame.cellSize);
}
export function gridCenterXInCenteredFrame(frame, col) {
    return col * frame.cellSize + frame.centerX - frame.offsetX + frame.cellSize * 0.5;
}
export function gridCenterYInCenteredFrame(frame, row) {
    return row * frame.cellSize + frame.centerY - frame.offsetY + frame.cellSize * 0.5;
}
export function getCellBoundsInCenteredFrame(buf, o, frame, idx) {
    const col = idxCol(idx, frame.cols);
    const row = idxRow(idx, frame.cols);
    const minX = col * frame.cellSize + frame.centerX - frame.offsetX;
    const minY = row * frame.cellSize + frame.centerY - frame.offsetY;
    minCornerAabbF32(buf, o, minX, minY, frame.cellSize, frame.cellSize);
}
/** Visit each obstacle-grid cell overlapping a world AABB `(buf, o)`. */
const CELL_RECT_SCRATCH = new Int32Array(4);
export function forEachObstacleGridCellInAabbF32(grid, buf, o, fn) {
    boundsToCellRectInto(CELL_RECT_SCRATCH, 0, buf[o] - grid.minX, buf[o + 1] - grid.minY, buf[o + 2] - grid.minX - 1e-6, buf[o + 3] - grid.minY - 1e-6, grid.cellSize);
    const cols = grid.cols;
    const rows = grid.rows;
    const startCol = Math.max(0, CELL_RECT_SCRATCH[0]);
    const endCol = Math.min(cols - 1, CELL_RECT_SCRATCH[1]);
    const startRow = Math.max(0, CELL_RECT_SCRATCH[2]);
    const endRow = Math.min(rows - 1, CELL_RECT_SCRATCH[3]);
    forEachCellInColRowBounds(startCol, endCol, startRow, endRow, cols, (c, r, idx) => fn(idx));
}
// Viewer-relative radial elevation projection (WORLD_RENDER_MODE_RADIAL).
// Elevated points lean away from live viewport.x/y — not fixed 2:1 isometric.
// Fixed isometric is a separate future mode; do not confuse with this mode.
// World props: geometry is built in world space (prop.facing at spawn).
// Symmetric cylinders use a viewer-facing silhouette (viewAngle for rim tangents only).
export function resolveElevationAlpha(height, viewport) {
    const { cameraHeight, perspectiveStrength } = viewport;
    if (height <= 0 || cameraHeight <= height) return 0;
    return (height / (cameraHeight - height)) * perspectiveStrength;
}
export function projectWorldPoint(buf, offset, worldX, worldY, height, viewport) {
    const alpha = resolveElevationAlpha(height, viewport);
    if (alpha <= 0) {
        buf[offset] = worldX;
        buf[offset + 1] = worldY;
    } else {
        buf[offset] = worldX + (worldX - viewport.x) * alpha;
        buf[offset + 1] = worldY + (worldY - viewport.y) * alpha;
    }
}
export function projectWorldPointToScreen(buf, offset, viewport, worldX, worldY, height) {
    projectWorldPoint(buf, offset, worldX, worldY, height, viewport);
    const wx = buf[offset];
    const wy = buf[offset + 1];
    buf[offset] = (wx - viewport.x) * viewport.zoom + viewport.cx;
    buf[offset + 1] = (wy - viewport.y) * viewport.zoom + viewport.cy;
}
export function projectWorldAabbCorners(buf, o, minX, minY, maxX, maxY, height, viewport) {
    projectWorldQuad(buf, o, minX, minY, maxX, minY, maxX, maxY, minX, maxY, height, viewport);
}
export function extrudeLocalVertsInto(baseOut, topOut, localVerts, cx, cy, topX, topY, alpha, facing = 0) {
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    const count = localVerts.length / 2;
    for (let i = 0; i < count; i++) {
        const lx = localVerts[i * 2];
        const ly = localVerts[i * 2 + 1];
        const topLx = lx * (1 + alpha);
        const topLy = ly * (1 + alpha);
        baseOut[i * 2] = cx + lx * cos - ly * sin;
        baseOut[i * 2 + 1] = cy + lx * sin + ly * cos;
        topOut[i * 2] = topX + topLx * cos - topLy * sin;
        topOut[i * 2 + 1] = topY + topLx * sin + topLy * cos;
    }
    return count;
}
export function isOutwardFaceTowardViewer(midX, midY, outwardX, outwardY, viewerX, viewerY) {
    const viewX = midX - viewerX;
    const viewY = midY - viewerY;
    return outwardX * viewX + outwardY * viewY < 0;
}
export function projectWorldQuad(buf, o, x0, y0, x1, y1, x2, y2, x3, y3, height, viewport) {
    const alpha = resolveElevationAlpha(height, viewport);
    if (alpha <= 0) {
        buf[o] = x0;
        buf[o + 1] = y0;
        buf[o + 2] = x1;
        buf[o + 3] = y1;
        buf[o + 4] = x2;
        buf[o + 5] = y2;
        buf[o + 6] = x3;
        buf[o + 7] = y3;
    } else {
        const vx = viewport.x;
        const vy = viewport.y;
        buf[o] = x0 + (x0 - vx) * alpha;
        buf[o + 1] = y0 + (y0 - vy) * alpha;
        buf[o + 2] = x1 + (x1 - vx) * alpha;
        buf[o + 3] = y1 + (y1 - vy) * alpha;
        buf[o + 4] = x2 + (x2 - vx) * alpha;
        buf[o + 5] = y2 + (y2 - vy) * alpha;
        buf[o + 6] = x3 + (x3 - vx) * alpha;
        buf[o + 7] = y3 + (y3 - vy) * alpha;
    }
}
/** Ground XY for the far edge of a roof-anchored shadow wedge. */
export function shadowGroundContact(buf, o, lx, ly, lightZ, wx, wy, wallTopZ, farDistance = 0) {
    if (lightZ <= wallTopZ) {
        if (farDistance > 0) {
            const dx = wx - lx;
            const dy = wy - ly;
            const dist = Math.hypot(dx, dy);
            if (dist > 0) {
                buf[o] = lx + (dx / dist) * farDistance;
                buf[o + 1] = ly + (dy / dist) * farDistance;
                return;
            }
        }
        buf[o] = wx;
        buf[o + 1] = wy;
        return;
    }
    const t = lightZ / (lightZ - wallTopZ);
    buf[o] = lx + (wx - lx) * t;
    buf[o + 1] = ly + (wy - ly) * t;
}
/** Screen-space shadow quad: near edge at projected wall top, far edge at ground contacts at z = 0. */
export function projectWallShadowQuadScreen(buf, o, viewport, lx, ly, lightZ, x1, y1, x2, y2, wallTopZ, farDistance = 0) {
    projectWorldPointToScreen(ENGINE_F32, S_OUT_SCREEN, viewport, x1, y1, wallTopZ);
    buf[o] = ENGINE_F32[S_OUT_SCREEN];
    buf[o + 1] = ENGINE_F32[S_OUT_SCREEN + 1];
    projectWorldPointToScreen(ENGINE_F32, S_OUT_SCREEN, viewport, x2, y2, wallTopZ);
    buf[o + 2] = ENGINE_F32[S_OUT_SCREEN];
    buf[o + 3] = ENGINE_F32[S_OUT_SCREEN + 1];
    shadowGroundContact(ENGINE_F32, S_OUT_XY, lx, ly, lightZ, x2, y2, wallTopZ, farDistance);
    projectWorldPointToScreen(ENGINE_F32, S_OUT_SCREEN, viewport, ENGINE_F32[S_OUT_XY], ENGINE_F32[S_OUT_XY + 1], 0);
    buf[o + 4] = ENGINE_F32[S_OUT_SCREEN];
    buf[o + 5] = ENGINE_F32[S_OUT_SCREEN + 1];
    shadowGroundContact(ENGINE_F32, S_OUT_XY, lx, ly, lightZ, x1, y1, wallTopZ, farDistance);
    projectWorldPointToScreen(ENGINE_F32, S_OUT_SCREEN, viewport, ENGINE_F32[S_OUT_XY], ENGINE_F32[S_OUT_XY + 1], 0);
    buf[o + 6] = ENGINE_F32[S_OUT_SCREEN];
    buf[o + 7] = ENGINE_F32[S_OUT_SCREEN + 1];
    return 4;
}
export function setBoundary(grid, idx, side, capHeightLevel, thicknessLevel = 1, bumpRevision = false) {
    const cols = grid.cols;
    const rows = grid.rows;
    if (idx < 0 || idx >= cols * rows) return false;
    if (capHeightLevel == null || capHeightLevel === 0) {
        clearBoundaryPrimary(grid, idx, side, bumpRevision);
        return true;
    }
    grid.writeMirroredCellEdge(idx, side, createRailWallEdge(capHeightLevel - neighborFillLevel(grid, idx, side), thicknessLevel));
    if (bumpRevision) bumpGridNavEpoch(grid, GRID_NAV_EPOCH_WALL);
    return true;
}
export function clearBoundaryPrimary(grid, idx, side, bumpRevision = false) {
    const cols = grid.cols;
    const rows = grid.rows;
    if (idx < 0 || idx >= cols * rows) return false;
    if (!isRailWallEdge(grid.getCellEdge(idx, side))) return false;
    grid.clearMirroredCellEdge(idx, side);
    if (bumpRevision) bumpGridNavEpoch(grid, GRID_NAV_EPOCH_WALL);
    return true;
}
export function clearAllBoundariesAtCell(grid, idx, bumpRevision = false) {
    let changed = false;
    for (let side = 0; side < 4; side++) if (clearBoundaryPrimary(grid, idx, side, bumpRevision)) changed = true;
    if (changed && bumpRevision) bumpGridNavEpoch(grid, GRID_NAV_EPOCH_WALL);
    return changed;
}
/** Directional step blocking: belt entry rules + rail-wall edges. */
export function boundaryBlocksStepFrom(grid, navCardinalOpen, vertexPassability, fromIdx, toIdx) {
    if (grid.grid[toIdx] !== 0) return true;
    if (BeltPacked.blocksStep(grid, fromIdx, toIdx)) return true;
    if (PortalLink.blocksStep(grid, fromIdx, toIdx)) return true;
    const cols = grid.cols;
    const diff = toIdx - fromIdx;
    if (diff === 1) return isRailWallEdge(grid.getCellEdge(fromIdx, 1));
    if (diff === -1) return isRailWallEdge(grid.getCellEdge(fromIdx, 3));
    if (diff === cols) return isRailWallEdge(grid.getCellEdge(fromIdx, 2));
    if (diff === -cols) return isRailWallEdge(grid.getCellEdge(fromIdx, 0));
    if (diff === cols + 1) return !diagonalStepOpen(navCardinalOpen, vertexPassability, grid, fromIdx, 1, 1);
    if (diff === cols - 1) return !diagonalStepOpen(navCardinalOpen, vertexPassability, grid, fromIdx, -1, 1);
    if (diff === -cols + 1) return !diagonalStepOpen(navCardinalOpen, vertexPassability, grid, fromIdx, 1, -1);
    if (diff === -cols - 1) return !diagonalStepOpen(navCardinalOpen, vertexPassability, grid, fromIdx, -1, -1);
    return false;
}
export const VERTEX_HALF_EDGE = { NwEast: 1 << 0, NwSouth: 1 << 1, NeWest: 1 << 2, NeSouth: 1 << 3, SwEast: 1 << 4, SwNorth: 1 << 5, SeWest: 1 << 6, SeNorth: 1 << 7 };
const HALF_EDGE_SPECS = [
    { bit: VERTEX_HALF_EDGE.NwEast, ownerCol: -1, ownerRow: -1, ownerSide: 1 },
    { bit: VERTEX_HALF_EDGE.NwSouth, ownerCol: -1, ownerRow: -1, ownerSide: 2 },
    { bit: VERTEX_HALF_EDGE.NeWest, ownerCol: 0, ownerRow: -1, ownerSide: 3 },
    { bit: VERTEX_HALF_EDGE.NeSouth, ownerCol: 0, ownerRow: -1, ownerSide: 2 },
    { bit: VERTEX_HALF_EDGE.SwEast, ownerCol: -1, ownerRow: 0, ownerSide: 1 },
    { bit: VERTEX_HALF_EDGE.SwNorth, ownerCol: -1, ownerRow: 0, ownerSide: 0 },
    { bit: VERTEX_HALF_EDGE.SeWest, ownerCol: 0, ownerRow: 0, ownerSide: 3 },
    { bit: VERTEX_HALF_EDGE.SeNorth, ownerCol: 0, ownerRow: 0, ownerSide: 0 },
];
export function packVertexKey(vx, vy, cols) {
    return vx + vy * (cols + 1);
}
export function recomputeVertexPassabilityInto(grid, vertexPassability, bounds = null) {
    if (!grid.cols) return;
    const { cols, rows } = grid;
    const vx0 = bounds ? Math.max(0, bounds.startCol) : 0;
    const vx1 = bounds ? Math.min(cols, bounds.endCol + 1) : cols;
    const vy0 = bounds ? Math.max(0, bounds.startRow) : 0;
    const vy1 = bounds ? Math.min(rows, bounds.endRow + 1) : rows;
    for (let vy = vy0; vy <= vy1; vy++)
        for (let vx = vx0; vx <= vx1; vx++) {
            let mask = 0;
            for (let i = 0; i < HALF_EDGE_SPECS.length; i++) {
                const spec = HALF_EDGE_SPECS[i];
                const ownerIdx = (vy + spec.ownerRow) * cols + (vx + spec.ownerCol);
                if (!isRailWallEdge(grid.getCellEdge(ownerIdx, spec.ownerSide))) mask |= spec.bit;
            }
            vertexPassability[packVertexKey(vx, vy, cols)] = mask;
        }
}
const DIAG_1_1 = [VERTEX_HALF_EDGE.NwEast, VERTEX_HALF_EDGE.NwSouth, VERTEX_HALF_EDGE.SwEast, VERTEX_HALF_EDGE.NeSouth];
const DIAG_N1_N1 = [VERTEX_HALF_EDGE.SeWest, VERTEX_HALF_EDGE.SeNorth, VERTEX_HALF_EDGE.SwNorth, VERTEX_HALF_EDGE.NeWest];
const DIAG_1_N1 = [VERTEX_HALF_EDGE.SwEast, VERTEX_HALF_EDGE.SwNorth, VERTEX_HALF_EDGE.NeSouth, VERTEX_HALF_EDGE.NwEast];
const DIAG_N1_1 = [VERTEX_HALF_EDGE.NeWest, VERTEX_HALF_EDGE.NeSouth, VERTEX_HALF_EDGE.SeWest, VERTEX_HALF_EDGE.NwSouth];
export function recomputeNavCardinalOpenInto(grid, cardinalOpen, vertexPassability, bounds = null) {
    const { cols, rows } = grid;
    const c0 = bounds ? bounds.startCol : 0;
    const c1 = bounds ? bounds.endCol : cols - 1;
    const r0 = bounds ? bounds.startRow : 0;
    const r1 = bounds ? bounds.endRow : rows - 1;
    forEachCellInColRowBounds(c0, c1, r0, r1, cols, (col, row, idx) => {
        if (grid.isBlockedIdx(idx)) {
            cardinalOpen[idx] = 0;
            return;
        }
        let mask = 0;
        forEachCardinalNeighborIdx(idx, { cols, rows }, (nIdx) => {
            if (!grid.isBlockedIdx(nIdx) && !boundaryBlocksStepFrom(grid, cardinalOpen, vertexPassability, idx, nIdx)) {
                const diff = nIdx - idx;
                if (diff === 1) mask |= 1;
                else if (diff === cols) mask |= 2;
                else if (diff === -1) mask |= 4;
                else if (diff === -cols) mask |= 8;
            }
        });
        cardinalOpen[idx] = mask;
    });
}
export function getCardinalBit(dc, dr) {
    if (dc === 1) return 1;
    if (dr === 1) return 2;
    if (dc === -1) return 4;
    return 8;
}
function cardinalLegOpen(cardinalOpen, cols, col, row, dc, dr) {
    return (cardinalOpen[row * cols + col] & getCardinalBit(dc, dr)) !== 0;
}
function diagonalCardinalLegsOpen(cardinalOpen, cols, col, row, dc, dr) {
    const shoulderHCol = col + dc;
    const shoulderHRow = row;
    const shoulderVCol = col;
    const shoulderVRow = row + dr;
    return cardinalLegOpen(cardinalOpen, cols, col, row, dc, 0) && cardinalLegOpen(cardinalOpen, cols, col, row, 0, dr) && cardinalLegOpen(cardinalOpen, cols, shoulderHCol, shoulderHRow, 0, dr) && cardinalLegOpen(cardinalOpen, cols, shoulderVCol, shoulderVRow, dc, 0);
}
export function diagonalStepOpen(cardinalOpen, vertexPassability, grid, fromIdx, dc, dr) {
    const cols = grid.cols;
    const col = fromIdx % cols;
    const row = (fromIdx / cols) | 0;
    if (!diagonalCardinalLegsOpen(cardinalOpen, cols, col, row, dc, dr)) return false;
    const cvx = dc > 0 ? col + dc : col;
    const cvy = dr > 0 ? row + dr : row;
    const mask = vertexPassability[packVertexKey(cvx, cvy, cols)] ?? 0;
    let need;
    if (dc === 1) need = dr === 1 ? DIAG_1_1 : DIAG_1_N1;
    else need = dr === 1 ? DIAG_N1_1 : DIAG_N1_N1;
    for (let i = 0; i < need.length; i++) if ((mask & need[i]) === 0) return false;
    return true;
}
export function createRailWallEdge(heightDelta, thicknessLevel) {
    return (heightDelta << 16) | thicknessLevel;
}
export function isRailWallEdge(edge) {
    return edge != null;
}
export function railWallEdgeHeightDelta(edge) {
    return edge >> 16;
}
export function railWallEdgeThicknessLevel(edge) {
    return edge & 0xff;
}
export function railWallCapLevel(edge, neighborFillLevel) {
    return neighborFillLevel + railWallEdgeHeightDelta(edge);
}
export function railWallHeightPx(edge, grid, neighborFillLevel) {
    return railWallCapLevel(edge, neighborFillLevel) * grid.cellSize;
}
export function railWallThicknessPx(edge) {
    return Math.max(1, railWallEdgeThicknessLevel(edge));
}
export const CELL_EDGE_SLOT_BYTES = 16;
export function cellEdgeSlotOffset(idx, side) {
    return (idx << 2) + side;
}
const EMPTY = -1;
export function corridorPerpendicularOffsets(width) {
    const offsets = new Array(width);
    const base = (width - 1) >> 1;
    for (let i = 0; i < width; i++) offsets[i] = i - base;
    return offsets;
}
export function collectCorridorPathPointIndices(pIdx, prevIdx, nextIdx, corridorWidth, interiorOnly, pathIndex, pathLength, layout) {
    if (interiorOnly && (pathIndex === 0 || pathIndex === pathLength - 1)) return [];
    const offsets = corridorPerpendicularOffsets(corridorWidth);
    const stride = layout.strideCols;
    let alongH = false;
    let alongV = false;
    if (prevIdx !== undefined) {
        const diff = prevIdx - pIdx;
        if (Math.abs(diff) === 1) alongH = true;
        else if (Math.abs(diff) === stride) alongV = true;
    }
    if (nextIdx !== undefined) {
        const diff = nextIdx - pIdx;
        if (Math.abs(diff) === 1) alongH = true;
        else if (Math.abs(diff) === stride) alongV = true;
    }
    const indices = [];
    if (alongH && alongV) {
        const seen = new Set();
        for (let oi = 0; oi < offsets.length; oi++) {
            const hIdx = pIdx + offsets[oi] * stride;
            const vIdx = pIdx + offsets[oi];
            if (!seen.has(hIdx)) {
                seen.add(hIdx);
                indices.push(hIdx);
            }
            if (!seen.has(vIdx)) {
                seen.add(vIdx);
                indices.push(vIdx);
            }
        }
        return indices;
    }
    if (alongH) {
        for (let oi = 0; oi < offsets.length; oi++) indices.push(pIdx + offsets[oi] * stride);
        return indices;
    }
    if (alongV) {
        for (let oi = 0; oi < offsets.length; oi++) indices.push(pIdx + offsets[oi]);
        return indices;
    }
    indices.push(pIdx);
    return indices;
}
export function corridorPathOccupiedCellIndices(path, corridorWidth, layout, options = {}) {
    const interiorOnly = options.interiorOnly !== false;
    const indices = new Set();
    for (let i = 0; i < path.length; i++) {
        const pIdx = path[i];
        const prevIdx = i > 0 ? path[i - 1] : undefined;
        const nextIdx = i + 1 < path.length ? path[i + 1] : undefined;
        const ptIndices = collectCorridorPathPointIndices(pIdx, prevIdx, nextIdx, corridorWidth, interiorOnly, i, path.length, layout);
        for (let ci = 0; ci < ptIndices.length; ci++) indices.add(ptIndices[ci]);
    }
    return indices;
}
export function addCorridorPathToOccupied(path, occupied, corridorWidth, layout, options = {}) {
    const indices = corridorPathOccupiedCellIndices(path, corridorWidth, layout, options);
    for (const idx of indices) occupied.add(idx);
}
export function collapsePathRevisits(path, layout) {
    const out = [];
    const indexByKey = new Map();
    for (let i = 0; i < path.length; i++) {
        const pIdx = path[i];
        if (indexByKey.has(pIdx)) out.length = indexByKey.get(pIdx);
        indexByKey.set(pIdx, out.length);
        out.push(pIdx);
    }
    return out;
}
export function corridorPathHitsOccupied(path, occupied, corridorWidth, layout, options = {}) {
    const indices = corridorPathOccupiedCellIndices(path, corridorWidth, layout, options);
    for (const idx of indices) if (occupied.has(idx)) return true;
    return false;
}
export function formatGlobalCellIdx(idx) {
    return `@${idx}`;
}
/**
 * Nav invalidation spine
 *
 * Edits → bumpGridNavEpoch(grid, channel) → gridNavCacheKey(grid) changes.
 *
 * | Cache / consumer              | Readiness check                          |
 * |-------------------------------|------------------------------------------|
 * | Worker topology arena         | gridNavCacheKey === worker._syncedNavCacheKey, no _navSyncPromise |
 * | NavRuntime.isTopologyCurrent()| same via NavRuntime.syncedTopologyKey()  |
 * | Per-agent replan (navSession) | navState.topologyKey !== nav.topologyKey() |
 * | Flow-field topology           | keys off gridNavCacheKey in FlowFieldGrid |
 * | HPA region graph (worker)     | worker._graphEpoch >= nav.graphSyncGeneration |
 *
 * Live edits must finish with nav.commitEdit(bounds) (Libraries/Sandbox/gridNavEdit.js).
 */
const GRID_NAV_EPOCH_BUMP = new Array(GRID_NAV_EPOCH_COUNT);
GRID_NAV_EPOCH_BUMP[GRID_NAV_EPOCH_WALL] = (grid) => {
    grid.wallGridRevision = (grid.wallGridRevision + 1) | 0;
    grid.invalidateStructureZLevelsCache();
    grid.invalidateNavTopology();
};
GRID_NAV_EPOCH_BUMP[GRID_NAV_EPOCH_FLOOR] = (grid) => {
    grid.floorNavEpoch = (grid.floorNavEpoch + 1) | 0;
    grid.invalidateNavTopology();
};
GRID_NAV_EPOCH_BUMP[GRID_NAV_EPOCH_TOPOLOGY] = (grid) => {
    grid.gridTopologyEpoch = (grid.gridTopologyEpoch + 1) | 0;
};
export function bumpGridNavEpoch(grid, channel) {
    const fn = GRID_NAV_EPOCH_BUMP[channel];
    if (!fn) throw new Error(`unknown grid nav epoch channel: ${channel}`);
    fn(grid);
}
/** Canonical live topology key — every staleness check derives from this. */
export function gridNavCacheKey(grid) {
    return `${grid.wallGridRevision}:${grid.gridTopologyEpoch}:${grid.floorNavEpoch}`;
}
/**
 * @param {import("../../Navigation/HpaPathWorker.js").HpaPathWorker} hpaPathWorker
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid
 */
export function isNavTopologyReady(hpaPathWorker, grid) {
    if (hpaPathWorker._navSyncPromise) return false;
    return gridNavCacheKey(grid) === hpaPathWorker._syncedNavCacheKey;
}
/** Floor belt grid-stamp draw cache key. */
export function floorOccupancyStampDrawCacheKey(grid) {
    return `${grid.floorNavEpoch}:${grid.cols}:${grid.rows}:${grid._floorStampDrawRevision ?? 0}`;
}
/** @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid */
export function bumpFloorOccupancyStampDrawRevision(grid) {
    grid._floorStampDrawRevision = ((grid._floorStampDrawRevision ?? 0) + 1) | 0;
}
export function bumpSurfaceMaterialRevision(grid) {
    grid.surfaceMaterialRevision = ((grid.surfaceMaterialRevision ?? 0) + 1) | 0;
}
/** @typedef {number} GlobalCellIdx Dense index on the obstacle grid: row * grid.cols + col. */
/** @typedef {number} LayoutCellIdx Dense index within a {@link CellIndexLayout} rect (local to origin/stride). */
function stampGlobalIdx(originIdx, localIdx, layoutCols, strideCols) {
    const q = (localIdx / strideCols) | 0;
    return originIdx + q * layoutCols + (localIdx - q * strideCols);
}
/** @typedef {{ originIdx: number, cols: number, rows: number, strideCols: number, cellCount: number }} CellIndexLayout */
export function stampLayoutFromConfig(grid, config) {
    if (config.boundsMode === "rect") {
        const strideCols = Math.max(1, Math.round(config.boundsCols));
        const stampRows = Math.max(1, Math.round(config.boundsRows));
        return { originIdx: config.boundsIdx, cols: grid.cols, rows: grid.rows, strideCols, cellCount: strideCols * stampRows };
    }
    const r = Math.max(1, Math.round(config.outerRadiusCells));
    const side = r * 2;
    return { originIdx: config.centerIdx - r - r * grid.cols, cols: grid.cols, rows: grid.rows, strideCols: side, cellCount: side * side };
}
export function forEachStampLocalIdx(cellCount, fn) {
    for (let localIdx = 0; localIdx < cellCount; localIdx++) fn(localIdx);
}
export function forEachStampGlobalIdx(originIdx, layoutCols, strideCols, cellCount, grid, config, fn) {
    forEachStampLocalIdx(cellCount, (localIdx) => {
        const idx = stampGlobalIdx(originIdx, localIdx, layoutCols, strideCols);
        if (idx >= 0 && idx < grid.grid.length && isIdxInMapGenBounds(config, grid, idx)) fn(idx, localIdx);
    });
}
/** @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid */
export function gridCellLayout(grid) {
    return { originIdx: 0, cols: grid.cols, rows: grid.rows, strideCols: grid.cols, cellCount: grid.cols * grid.rows };
}
export function cellInRect(idx, grid) {
    const cols = grid.cols;
    const rows = grid.rows;
    return idx >= 0 && idx < cols * rows;
}
const GRID_SIDE_NEIGHBOR_LABELS = ["North neighbor", "East neighbor", "South neighbor", "West neighbor"];
export const GRID_SIDE_NX = Int8Array.from([0, 1, 0, -1]);
export const GRID_SIDE_NY = Int8Array.from([-1, 0, 1, 0]);
/** Neighbor cell reached by stepping outward across side. */
const GRID_EDGE_SIDE_FACING = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
/** Facing radians for grid edge side 0=N, 1=E, 2=S, 3=W. */
export function makeAdjacencyKey(idA, idB) {
    return idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
}
export function manhattanDistanceIdx(idxA, idxB, cols) {
    const rowA = idxRow(idxA, cols);
    const colA = idxCol(idxA, cols);
    const rowB = idxRow(idxB, cols);
    const colB = idxCol(idxB, cols);
    return Math.abs(colA - colB) + Math.abs(rowA - rowB);
}
export function octileDistanceIdx(idxA, idxB, cols) {
    const rowA = idxRow(idxA, cols);
    const colA = idxCol(idxA, cols);
    const rowB = idxRow(idxB, cols);
    const colB = idxCol(idxB, cols);
    const dx = Math.abs(colA - colB);
    const dy = Math.abs(rowA - rowB);
    const min = Math.min(dx, dy);
    const max = Math.max(dx, dy);
    return min * 1.41421356 + (max - min);
}
export function forEachCardinalNeighborIdx(idx, grid, fn) {
    const cols = grid.cols;
    const rows = grid.rows;
    const row = idxRow(idx, cols);
    const col = idxCol(idx, cols);
    if (row > 0) fn(idx - cols);
    if (col < cols - 1) fn(idx + 1);
    if (row < rows - 1) fn(idx + cols);
    if (col > 0) fn(idx - 1);
}
export const NAV_EDGE_POOL_SAB_STRIDE = 4;
/** @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid */
export function navEdgePoolSabByteLength(refCount) {
    return Math.max(refCount * NAV_EDGE_POOL_SAB_STRIDE, NAV_EDGE_POOL_SAB_STRIDE);
}
/** @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid @param {Uint8Array} bytes */
export function packEdgePoolToSab(grid, bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const pool = grid.cellEdgePool;
    for (let ref = 0; ref < grid.cellEdgeCount; ref++) writeEdgeToSab(view, ref, pool[ref]);
    return grid.cellEdgeCount;
}
/** @param {DataView} view @param {number} ref @param {object | undefined} edge */
function writeEdgeToSab(view, ref, edge) {
    const base = ref * NAV_EDGE_POOL_SAB_STRIDE;
    const heightDelta = edge != null ? railWallEdgeHeightDelta(edge) : 0;
    const thicknessLevel = edge != null ? railWallEdgeThicknessLevel(edge) : 1;
    view.setInt16(base + 0, heightDelta, true);
    view.setUint8(base + 2, thicknessLevel);
}
/** Worker-owned pool objects — updated in place from SAB each nav sync. */
const workerEdgePool = new Int32Array(0);
/** @param {Uint8Array} bytes @param {number} refCount */
export function bindNavEdgePoolFromSab(bytes, refCount) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const pool = new Int32Array(refCount);
    for (let ref = 0; ref < refCount; ref++) {
        const base = ref * NAV_EDGE_POOL_SAB_STRIDE;
        const heightDelta = view.getInt16(base + 0, true);
        const thicknessLevel = view.getUint8(base + 2) || 1;
        pool[ref] = (heightDelta << 16) | thicknessLevel;
    }
    return pool;
}
// Surface material ownership resolves from the narrowest owner outward:
// cell/edge override, then chunk profile, then the active/default profile.
export const SURFACE_MATERIAL_OWNER = { Chunk: 0, Cell: 1, Edge: 2, WallFace: 3 };
export class SurfaceMaterialStore {
    constructor() {
        this.cellProfileIds = new Map();
        this.edgeProfileIds = new Map();
        this.chunkProfileIds = new Map();
        this.cols = 0;
        this.rows = 0;
    }
    reset(cols = 0, rows = 0) {
        this.cellProfileIds.clear();
        this.edgeProfileIds.clear();
        this.chunkProfileIds.clear();
        this.cols = cols;
        this.rows = rows;
    }
    snapshot() {
        return { cellProfileIds: new Map(this.cellProfileIds), edgeProfileIds: new Map(this.edgeProfileIds), chunkProfileIds: new Map(this.chunkProfileIds) };
    }
    remap(snapshot, oldCols, oldRows, colOffset, rowOffset, newCols, newRows, cellsPerChunk) {
        this.cols = newCols;
        this.rows = newRows;
        this.cellProfileIds.clear();
        this.edgeProfileIds.clear();
        this.chunkProfileIds.clear();
        for (const [idx, profileId] of snapshot.cellProfileIds) {
            const col = idx % oldCols;
            const row = (idx / oldCols) | 0;
            const nc = col + colOffset;
            const nr = row + rowOffset;
            if (nc < 0 || nc >= newCols || nr < 0 || nr >= newRows) continue;
            this.cellProfileIds.set(nc + nr * newCols, profileId);
        }
        for (const [slot, profileId] of snapshot.edgeProfileIds) {
            const idx = slot >> 2;
            const side = slot & 3;
            const col = idx % oldCols;
            const row = (idx / oldCols) | 0;
            const nc = col + colOffset;
            const nr = row + rowOffset;
            if (nc < 0 || nc >= newCols || nr < 0 || nr >= newRows) continue;
            const newIdx = nc + nr * newCols;
            this.edgeProfileIds.set((newIdx << 2) + side, profileId);
        }
        if (snapshot.chunkProfileIds.size > 0 && (!cellsPerChunk || cellsPerChunk <= 0)) throw new Error("Surface material chunk remap requires cellsPerChunk");
        for (const [key, profileId] of snapshot.chunkProfileIds) {
            const axis0 = chunkKeyAxis0(key);
            const axis1 = chunkKeyAxis1(key);
            const newAxis0 = cellToChunkCoord(axis0 * cellsPerChunk + colOffset, cellsPerChunk);
            const newAxis1 = cellToChunkCoord(axis1 * cellsPerChunk + rowOffset, cellsPerChunk);
            this.chunkProfileIds.set(packChunkKey(newAxis0, newAxis1), profileId);
        }
    }
    getChunkAtKey(chunkKey) {
        return this.chunkProfileIds.get(chunkKey) ?? null;
    }
    setChunkAtKey(chunkKey, profileId) {
        this.chunkProfileIds.set(chunkKey, profileId);
    }
    clearChunkAtKey(chunkKey) {
        this.chunkProfileIds.delete(chunkKey);
    }
    setChunkProfileForCellBounds(cellBounds, cellsPerChunk, profileId) {
        forEachChunkKeyInCellBounds(cellBounds, cellsPerChunk, (key) => this.setChunkAtKey(key, profileId));
    }
    getCellAtIdx(idx) {
        return this.cellProfileIds.get(idx) ?? null;
    }
    setCellAtIdx(idx, profileId) {
        this.cellProfileIds.set(idx, profileId);
    }
    clearCellAtIdx(idx) {
        this.cellProfileIds.delete(idx);
    }
    hasAnyCellAtIdx(idx) {
        return this.cellProfileIds.has(idx);
    }
    getEdgeByIdx(idx, side) {
        return this.edgeProfileIds.get(cellEdgeSlotOffset(idx, side)) ?? null;
    }
    writeEdgeMirrored(idx, side, profileId) {
        const cols = this.cols;
        const rows = this.rows;
        if (idx < 0 || idx >= cols * rows) return;
        this.clearEdgeMirrored(idx, side);
        this.edgeProfileIds.set(cellEdgeSlotOffset(idx, side), profileId);
        const nIdx = edgeNeighborIdx(idx, side, this);
        if (nIdx !== -1) this.edgeProfileIds.set(cellEdgeSlotOffset(nIdx, edgeMirrorSide(side)), profileId);
    }
    clearEdgeMirrored(idx, side) {
        const cols = this.cols;
        const rows = this.rows;
        if (idx < 0 || idx >= cols * rows) return;
        this.edgeProfileIds.delete(cellEdgeSlotOffset(idx, side));
        const nIdx = edgeNeighborIdx(idx, side, this);
        if (nIdx !== -1) this.edgeProfileIds.delete(cellEdgeSlotOffset(nIdx, edgeMirrorSide(side)));
    }
    hasAnyEdgeAtIdx(idx) {
        return this.edgeProfileIds.has(cellEdgeSlotOffset(idx, 0)) || this.edgeProfileIds.has(cellEdgeSlotOffset(idx, 1)) || this.edgeProfileIds.has(cellEdgeSlotOffset(idx, 2)) || this.edgeProfileIds.has(cellEdgeSlotOffset(idx, 3));
    }
}
export function resolveSurfaceProfileId(grid, ownerKind, baseProfileId, cellsPerChunk, a, b = 0, c = 0) {
    if (ownerKind === SURFACE_MATERIAL_OWNER.Chunk) return grid.surfaceMaterials.getChunkAtKey(a) ?? baseProfileId;
    if (ownerKind === SURFACE_MATERIAL_OWNER.Cell) {
        const chunkBase = cellsPerChunk > 0 ? resolveSurfaceProfileId(grid, SURFACE_MATERIAL_OWNER.Chunk, baseProfileId, 0, cellIdxToChunkKey(a, grid, cellsPerChunk)) : baseProfileId;
        return grid.surfaceMaterials.getCellAtIdx(a) ?? chunkBase;
    }
    if (ownerKind === SURFACE_MATERIAL_OWNER.WallFace) {
        const chunkBase = cellsPerChunk > 0 ? resolveSurfaceProfileId(grid, SURFACE_MATERIAL_OWNER.Chunk, baseProfileId, 0, cellIdxToChunkKey(a, grid, cellsPerChunk)) : baseProfileId;
        if (c) return grid.surfaceMaterials.getEdgeByIdx(a, b) ?? chunkBase;
        return grid.surfaceMaterials.getCellAtIdx(a) ?? chunkBase;
    }
    throw new Error(`unknown surface material owner kind: ${ownerKind}`);
}
export function resolveEdgeSurfaceProfileId(grid, idx, side, baseProfileId, cellsPerChunk = 0) {
    const chunkBase = cellsPerChunk > 0 ? resolveSurfaceProfileId(grid, SURFACE_MATERIAL_OWNER.Chunk, baseProfileId, 0, cellIdxToChunkKey(idx, grid, cellsPerChunk)) : baseProfileId;
    return grid.surfaceMaterials.getEdgeByIdx(idx, side) ?? chunkBase;
}
export class WorldObstacleGrid {
    constructor(cellSize) {
        this.cellSize = cellSize;
        this.cellHalfSize = cellSize * 0.5;
        this.minX = 0;
        this.maxX = 0;
        this.minY = 0;
        this.maxY = 0;
        this.cols = 0;
        this.rows = 0;
        this.grid = new Uint8Array(0);
        this.cellEdgeSlots = new Int32Array(0);
        this.cellEdgePool = new Int32Array(1024);
        this.cellEdgeCount = 0;
        this.cellEdgeFree = [];
        this.floorPacked = new Uint8Array(0);
        this.floorBeltCount = 0;
        this.portalTargetIdx = new Int32Array(0);
        this.activePortalPairs = new Int32Array(8);
        this.activePortalCount = 0;
        this._floorBeltLoad = new Uint8Array(0);
        this._floorBeltAnimMs = new Uint32Array(0);
        this._floorBeltLoadedIdx = new Uint32Array(0);
        this._floorBeltLoadedCount = 0;
        this.surfaceMaterials = new SurfaceMaterialStore();
        this.surfaceMaterialCellsPerChunk = 0;
        this.staticPropBuckets = new SparseBucketGrid();
        this.staticPropCount = new Uint16Array(0);
        this.staticPropTotalCount = 0;
        this.wallGridRevision = 0;
        this.surfaceMaterialRevision = 0;
        this._structureZLevelsRevision = -1;
        this._structureZLevels = [];
        this._fillZLevels = [];
        this.floorNavEpoch = 0;
        this.gridTopologyEpoch = 0;
        this._navTopologyRef = null;
        this.onBoundsResync = null;
        this.onBoundsExpansion = null;
    }
    getCellEdge(idx, side) {
        const ref = this.cellEdgeSlots[(idx << 2) + side];
        if (ref === EMPTY) return null;
        return this.cellEdgePool[ref];
    }
    _allocCellEdge(edge) {
        if (this.cellEdgeFree.length) {
            const ref = this.cellEdgeFree.pop();
            this.cellEdgePool[ref] = edge;
            return ref;
        }
        const ref = this.cellEdgeCount++;
        if (ref >= this.cellEdgePool.length) {
            const next = new Int32Array(this.cellEdgePool.length * 2);
            next.set(this.cellEdgePool);
            this.cellEdgePool = next;
        }
        this.cellEdgePool[ref] = edge;
        return ref;
    }
    _freeCellEdge(ref) {
        this.cellEdgeFree.push(ref);
    }
    writeMirroredCellEdge(idx, side, edge) {
        if (idx < 0 || idx >= this.cols * this.rows) return;
        if (!edge) {
            this.clearMirroredCellEdge(idx, side);
            return;
        }
        this.clearMirroredCellEdge(idx, side);
        const ref = this._allocCellEdge(edge);
        this.cellEdgeSlots[(idx << 2) + side] = ref;
        const nIdx = edgeNeighborIdx(idx, side, this);
        if (nIdx !== -1) this.cellEdgeSlots[(nIdx << 2) + edgeMirrorSide(side)] = ref;
    }
    clearMirroredCellEdge(idx, side) {
        if (idx < 0 || idx >= this.cols * this.rows) return;
        const offset = (idx << 2) + side;
        const ref = this.cellEdgeSlots[offset];
        if (ref === EMPTY) return;
        this.cellEdgeSlots[offset] = EMPTY;
        const nIdx = edgeNeighborIdx(idx, side, this);
        if (nIdx !== -1) this.cellEdgeSlots[(nIdx << 2) + edgeMirrorSide(side)] = EMPTY;
        this._freeCellEdge(ref);
    }
    hasAnyCellEdgeAtIdx(idx) {
        const base = idx << 2;
        return this.cellEdgeSlots[base] !== EMPTY || this.cellEdgeSlots[base + 1] !== EMPTY || this.cellEdgeSlots[base + 2] !== EMPTY || this.cellEdgeSlots[base + 3] !== EMPTY;
    }
    invalidateNavTopology() {
        invalidateGridLocalNavBake(this);
    }
    invalidateStructureZLevelsCache() {
        this._structureZLevelsRevision = -1;
    }
    _rebuildStaticZLevelCaches() {
        const fillSeen = new Set();
        const fillOut = [];
        const structSeen = new Set();
        const structOut = [];
        const size = this.cols * this.rows;
        for (let idx = 0; idx < size; idx++) {
            const px = resolveCellWallHeightAtIdx(this, idx);
            if (px > 0 && !fillSeen.has(px)) {
                fillSeen.add(px);
                fillOut.push(px);
                structSeen.add(px);
                structOut.push(px);
            }
        }
        fillOut.sort((a, b) => a - b);
        const seenEdge = new Set();
        const gridCellCount = this.cols * this.rows;
        for (let idx = 0; idx < gridCellCount; idx++)
            for (let side = 0; side < 4; side++) {
                const ref = this.cellEdgeSlots[(idx << 2) + side];
                if (ref === EMPTY) continue;
                const edge = this.cellEdgePool[ref];
                seenEdge.add(railWallHeightPx(edge, this, neighborFillLevel(this, idx, side)));
            }
        const edgeLevels = [...seenEdge];
        edgeLevels.sort((a, b) => a - b);
        for (let i = 0; i < edgeLevels.length; i++) {
            const px = edgeLevels[i];
            if (!structSeen.has(px)) {
                structSeen.add(px);
                structOut.push(px);
            }
        }
        structOut.sort((a, b) => a - b);
        this._fillZLevels = fillOut;
        this._structureZLevels = structOut;
        this._structureZLevelsRevision = this.wallGridRevision;
    }
    // Voxel fill caps + edge-rail tops (px) — all horizontal structure layers for chunk/surface passes.
    collectStaticStructureZLevels() {
        if (this._structureZLevelsRevision !== this.wallGridRevision) this._rebuildStaticZLevelCaches();
        return this._structureZLevels;
    }
    // Voxel fill caps only (px) — horizontal roofs over stamped grid[] walls, not edge rails.
    collectStaticFillZLevels() {
        if (this._structureZLevelsRevision !== this.wallGridRevision) this._rebuildStaticZLevelCaches();
        return this._fillZLevels;
    }
    _borrowStaticWallVoxel(x, y, idx) {
        const flags = WALL_SEG_VOXEL;
        const key = packStaticWallSegKey(idx, 0, flags);
        const existing = lookupStaticWallSegIntern(key);
        if (existing >= 0) return existing;
        const size = this.cellSize;
        const id = allocStaticWallSegment();
        const slab = staticWallSegmentSlab;
        slab.x[id] = x;
        slab.y[id] = y;
        slab.angle[id] = 0;
        slab.width[id] = size;
        slab.height[id] = size;
        slab.size[id] = size;
        slab.gridIdx[id] = idx;
        slab.gridSide[id] = 0;
        slab.flags[id] = flags;
        insertStaticWallSegIntern(key, id);
        return id;
    }
    appendStaticWallSegmentsNearWorld(worldX, worldY, queryRadius, outIds) {
        const ec = this.worldCol(worldX);
        const er = this.worldRow(worldY);
        const pad = 1 + Math.ceil(queryRadius / this.cellSize);
        const minCol = Math.max(0, ec - pad);
        const maxCol = Math.min(this.cols - 1, ec + pad);
        const minRow = Math.max(0, er - pad);
        const maxRow = Math.min(this.rows - 1, er + pad);
        const slab = staticWallSegmentSlab;
        forEachDenseCellInRect(this, minCol, maxCol, minRow, maxRow, (idx) => {
            if (this.grid[idx] !== 0) outIds.push(this._borrowStaticWallVoxel(this.gridCenterXByIdx(idx), this.gridCenterYByIdx(idx), idx));
            for (let side = 0; side < 4; side++) {
                if (!railWallEdgeShouldEmit(this, idx, side)) continue;
                const flags = WALL_SEG_EDGE_RAIL | WALL_SEG_STATIC_FACE;
                const key = packStaticWallSegKey(idx, side, flags);
                const existing = lookupStaticWallSegIntern(key);
                if (existing >= 0) {
                    outIds.push(existing);
                    continue;
                }
                const thickness = edgeRailCollisionThicknessPx(this, idx, side);
                cellEdgeEndpointsIdx(this, idx, side, ENGINE_F32, S_EDGE_P1X, S_EDGE_P2X, 0);
                const p1x = ENGINE_F32[S_EDGE_P1X];
                const p1y = ENGINE_F32[S_EDGE_P1Y];
                const p2x = ENGINE_F32[S_EDGE_P2X];
                const p2y = ENGINE_F32[S_EDGE_P2Y];
                const dx = p2x - p1x;
                const dy = p2y - p1y;
                const len = Math.hypot(dx, dy);
                const id = allocStaticWallSegment();
                slab.x[id] = (p1x + p2x) * 0.5;
                slab.y[id] = (p1y + p2y) * 0.5;
                slab.angle[id] = Math.atan2(dy, dx);
                slab.width[id] = len;
                slab.height[id] = thickness;
                slab.size[id] = Math.max(len, thickness);
                slab.gridIdx[id] = idx;
                slab.gridSide[id] = side;
                slab.flags[id] = flags;
                insertStaticWallSegIntern(key, id);
                outIds.push(id);
            }
        });
        return outIds;
    }
    rebuildFixed(centerX, centerY, width, height) {
        const halfW = width * 0.5;
        const halfH = height * 0.5;
        this.minX = centerX - halfW;
        this.minY = centerY - halfH;
        this.maxX = centerX + halfW;
        this.maxY = centerY + halfH;
        this.cols = Math.ceil(width / this.cellSize);
        this.rows = Math.ceil(height / this.cellSize);
        const size = this.cols * this.rows;
        this.grid = new Uint8Array(size);
        this.cellEdgeSlots = new Int32Array(size * 4);
        this.cellEdgeSlots.fill(EMPTY);
        this.cellEdgeCount = 0;
        this.cellEdgeFree.length = 0;
        this.floorPacked = new Uint8Array(size);
        this.floorBeltCount = 0;
        this.portalTargetIdx = new Int32Array(size);
        this.portalTargetIdx.fill(-1);
        this.activePortalPairs = new Int32Array(8);
        this.activePortalCount = 0;
        this._floorBeltLoad = new Uint8Array(size);
        this._floorBeltAnimMs = new Uint32Array(size);
        this._floorBeltLoadedIdx = new Uint32Array(8);
        this._floorBeltLoadedCount = 0;
        this.staticPropBuckets.clear();
        this.staticPropCount = new Uint16Array(size);
        this.staticPropTotalCount = 0;
        this.surfaceMaterials.reset(this.cols, this.rows);
        bumpSurfaceMaterialRevision(this);
        this.invalidateStructureZLevelsCache();
        this.invalidateNavTopology();
        bumpGridNavEpoch(this, GRID_NAV_EPOCH_TOPOLOGY);
        if (this.onBoundsResync) this.onBoundsResync(this);
    }
    expandToCoverAabbF32(buf, o) {
        if (this.cols <= 0) {
            const width = buf[o + 2] - buf[o];
            const height = buf[o + 3] - buf[o + 1];
            this.rebuildFixed((buf[o] + buf[o + 2]) / 2, (buf[o + 1] + buf[o + 3]) / 2, width, height);
            return true;
        }
        const newMinX = Math.min(this.minX, buf[o]);
        const newMinY = Math.min(this.minY, buf[o + 1]);
        const newMaxX = Math.max(this.maxX, buf[o + 2]);
        const newMaxY = Math.max(this.maxY, buf[o + 3]);
        if (newMinX === this.minX && newMinY === this.minY && newMaxX === this.maxX && newMaxY === this.maxY) return false;
        const oldMinX = this.minX;
        const oldMinY = this.minY;
        const oldCols = this.cols;
        const oldRows = this.rows;
        const oldGrid = this.grid;
        const colOffset = Math.round((oldMinX - newMinX) / this.cellSize);
        const rowOffset = Math.round((oldMinY - newMinY) / this.cellSize);
        this.minX = newMinX;
        this.minY = newMinY;
        this.maxX = newMaxX;
        this.maxY = newMaxY;
        this.cols = Math.ceil((newMaxX - newMinX) / this.cellSize);
        this.rows = Math.ceil((newMaxY - newMinY) / this.cellSize);
        const newGrid = new Uint8Array(this.cols * this.rows);
        const oldSlots = this.cellEdgeSlots;
        const oldFloorPacked = this.floorPacked;
        const oldPortalTargetIdx = this.portalTargetIdx;
        const oldFloorBeltLoad = this._floorBeltLoad;
        const oldFloorBeltAnimMs = this._floorBeltAnimMs;
        const oldSurfaceMaterials = this.surfaceMaterials.snapshot();
        const oldSize = oldCols * oldRows;
        const newEdgeSlots = new Int32Array(this.cols * this.rows * 4);
        newEdgeSlots.fill(EMPTY);
        const newFloorPacked = new Uint8Array(this.cols * this.rows);
        const newPortalTargetIdx = new Int32Array(this.cols * this.rows);
        newPortalTargetIdx.fill(-1);
        const newFloorBeltLoad = new Uint8Array(this.cols * this.rows);
        const newFloorBeltAnimMs = new Uint32Array(this.cols * this.rows);
        let floorBeltCount = 0;
        let newActivePortalPairs = new Int32Array(8);
        let activePortalCount = 0;
        for (let idx = 0; idx < oldSize; idx++) {
            const level = oldGrid[idx];
            if (level === 0 && !this.hasAnyCellEdgeAtIdx(idx) && this.floorPacked[idx] === 0 && !this.surfaceMaterials.hasAnyCellAtIdx(idx) && !this.surfaceMaterials.hasAnyEdgeAtIdx(idx)) continue;
            const col = idx % oldCols;
            const row = (idx / oldCols) | 0;
            const nc = col + colOffset;
            const nr = row + rowOffset;
            if (nc >= 0 && nc < this.cols && nr >= 0 && nr < this.rows) {
                const newIdx = nc + nr * this.cols;
                if (cellInRect(newIdx, this)) {
                    newGrid[newIdx] = level;
                    if (this.floorPacked[idx] !== 0) {
                        newFloorPacked[newIdx] = this.floorPacked[idx];
                        newFloorBeltLoad[newIdx] = oldFloorBeltLoad[idx];
                        newFloorBeltAnimMs[newIdx] = oldFloorBeltAnimMs[idx];
                        floorBeltCount++;
                    }
                    const portalTarget = oldPortalTargetIdx[idx];
                    if (portalTarget >= 0) {
                        const targetCol = portalTarget % oldCols;
                        const targetRow = (portalTarget / oldCols) | 0;
                        const targetNc = targetCol + colOffset;
                        const targetNr = targetRow + rowOffset;
                        if (targetNc >= 0 && targetNc < this.cols && targetNr >= 0 && targetNr < this.rows) {
                            const remappedTarget = targetNc + targetNr * this.cols;
                            newPortalTargetIdx[newIdx] = remappedTarget;
                            const w = activePortalCount * 2;
                            if (w + 2 > newActivePortalPairs.length) {
                                const grown = new Int32Array(newActivePortalPairs.length * 2);
                                grown.set(newActivePortalPairs);
                                newActivePortalPairs = grown;
                            }
                            newActivePortalPairs[w] = newIdx;
                            newActivePortalPairs[w + 1] = remappedTarget;
                            activePortalCount++;
                        }
                    }
                    for (let side = 0; side < 4; side++) newEdgeSlots[(newIdx << 2) + side] = this.cellEdgeSlots[(idx << 2) + side];
                }
            }
        }
        this.cellEdgeSlots = newEdgeSlots;
        this.floorPacked = newFloorPacked;
        this.portalTargetIdx = newPortalTargetIdx;
        this.activePortalPairs = newActivePortalPairs;
        this.activePortalCount = activePortalCount;
        this._floorBeltLoad = newFloorBeltLoad;
        this._floorBeltAnimMs = newFloorBeltAnimMs;
        this._floorBeltLoadedIdx = new Uint32Array(8);
        this._floorBeltLoadedCount = 0;
        this.floorBeltCount = floorBeltCount;
        this.staticPropBuckets.clear();
        this.staticPropCount = new Uint16Array(this.cols * this.rows);
        this.staticPropTotalCount = 0;
        this.surfaceMaterials.remap(oldSurfaceMaterials, oldCols, oldRows, colOffset, rowOffset, this.cols, this.rows, this.surfaceMaterialCellsPerChunk);
        this.grid = newGrid;
        if (this.onBoundsExpansion) this.onBoundsExpansion(colOffset, rowOffset, oldCols, oldRows);
        bumpSurfaceMaterialRevision(this);
        this.invalidateStructureZLevelsCache();
        this.invalidateNavTopology();
        bumpGridNavEpoch(this, GRID_NAV_EPOCH_TOPOLOGY);
        if (this.onBoundsResync) this.onBoundsResync(this);
        return true;
    }
    // layout anchors the stamp; cells is row-major local with 1 = blocked.
    stampStaticWalls(originIdx, gridCols, gridRows, strideCols, cellCount, cells, { additive = false, heightLevel }) {
        const level = heightLevel;
        const gridBounds = cellBoundsFromStampScalars(originIdx, gridCols, gridRows, strideCols, cellCount);
        const cols = strideCols;
        const baseCol = originIdx % this.cols;
        const baseRow = (originIdx / this.cols) | 0;
        if (!additive)
            forEachDenseCellInRect(this, gridBounds.startCol, gridBounds.endCol, gridBounds.startRow, gridBounds.endRow, (idx) => {
                this.grid[idx] = 0;
            });
        let changed = false;
        for (let i = 0; i < cellCount; i++) {
            if (cells[i] !== 1) continue;
            const lr = (i / cols) | 0;
            const lc = i % cols;
            const col = baseCol + lc;
            const row = baseRow + lr;
            if (col >= 0 && col < this.cols && row >= 0 && row < this.rows) {
                const idx = col + row * this.cols;
                if (idx >= 0 && idx < this.cols * this.rows) {
                    if (additive && this.grid[idx] !== 0) continue;
                    this.grid[idx] = level;
                    changed = true;
                }
            }
        }
        if (changed) bumpGridNavEpoch(this, GRID_NAV_EPOCH_WALL);
        return gridBounds;
    }
    stampCellEdge(idx, side, capHeightLevel, thicknessLevel = 1) {
        setBoundary(this, idx, side, capHeightLevel, thicknessLevel, true);
    }
    clearCellEdges(idx) {
        clearAllBoundariesAtCell(this, idx, false);
    }
    setCellSurfaceProfileAtIdx(idx, profileId) {
        this.surfaceMaterials.setCellAtIdx(idx, profileId);
        bumpSurfaceMaterialRevision(this);
    }
    clearCellSurfaceProfileAtIdx(idx) {
        this.surfaceMaterials.clearCellAtIdx(idx);
        bumpSurfaceMaterialRevision(this);
    }
    setEdgeSurfaceProfile(idx, side, profileId) {
        this.surfaceMaterials.writeEdgeMirrored(idx, side, profileId);
        bumpSurfaceMaterialRevision(this);
    }
    clearEdgeSurfaceProfile(idx, side) {
        this.surfaceMaterials.clearEdgeMirrored(idx, side);
        bumpSurfaceMaterialRevision(this);
    }
    setChunkSurfaceProfileAtKey(chunkKey, profileId, cellsPerChunk = 0) {
        if (cellsPerChunk > 0) this.surfaceMaterialCellsPerChunk = cellsPerChunk;
        this.surfaceMaterials.setChunkAtKey(chunkKey, profileId);
        bumpSurfaceMaterialRevision(this);
    }
    clearChunkSurfaceProfileAtKey(chunkKey, cellsPerChunk = 0) {
        if (cellsPerChunk > 0) this.surfaceMaterialCellsPerChunk = cellsPerChunk;
        this.surfaceMaterials.clearChunkAtKey(chunkKey);
        bumpSurfaceMaterialRevision(this);
    }
    setChunkSurfaceProfileForCellBounds(cellBounds, profileId, cellsPerChunk = 0) {
        if (cellsPerChunk > 0) this.surfaceMaterialCellsPerChunk = cellsPerChunk;
        this.surfaceMaterials.setChunkProfileForCellBounds(cellBounds, cellsPerChunk, profileId);
        bumpSurfaceMaterialRevision(this);
    }
    writeFloorCell(idx, packed) {
        if (this.isBlockedIdx(idx)) return false;
        if (packed !== 0 && !BeltPacked.isValid(packed)) return false;
        const prevPacked = this.floorPacked[idx];
        const hadBelt = prevPacked !== 0;
        const hasBelt = packed !== 0;
        if (!hadBelt && hasBelt) this.floorBeltCount++;
        else if (hadBelt && !hasBelt) {
            this.floorBeltCount--;
            this._floorBeltLoad[idx] = 0;
            this._floorBeltAnimMs[idx] = 0;
        }
        this.floorPacked[idx] = packed;
        if ((hadBelt || hasBelt) && prevPacked !== packed) bumpGridNavEpoch(this, GRID_NAV_EPOCH_FLOOR);
        bumpFloorOccupancyStampDrawRevision(this);
        return true;
    }
    hasFloorOccupancy(idx) {
        if (idx < 0 || idx >= this.cols * this.rows) return false;
        return this.floorPacked[idx] !== 0;
    }
    clearFloorCell(idx) {
        if (idx < 0 || idx >= this.cols * this.rows) return false;
        if (this.floorPacked[idx] === 0) return false;
        bumpGridNavEpoch(this, GRID_NAV_EPOCH_FLOOR);
        this.floorBeltCount--;
        this.floorPacked[idx] = 0;
        this._floorBeltLoad[idx] = 0;
        this._floorBeltAnimMs[idx] = 0;
        bumpFloorOccupancyStampDrawRevision(this);
        return true;
    }
    clearAllFloorCells() {
        this.floorPacked.fill(0);
        this._floorBeltLoad.fill(0);
        this._floorBeltAnimMs.fill(0);
        this._floorBeltLoadedCount = 0;
        this.floorBeltCount = 0;
        bumpFloorOccupancyStampDrawRevision(this);
    }
    worldCol(x) {
        return worldColAtOrigin(x, this.minX, this.cellSize);
    }
    worldRow(y) {
        return worldRowAtOrigin(y, this.minY, this.cellSize);
    }
    gridCenterX(col) {
        return gridCenterXAtOrigin(col, this.minX, this.cellHalfSize);
    }
    gridCenterY(row) {
        return gridCenterYAtOrigin(row, this.minY, this.cellHalfSize);
    }
    gridCenterXByIdx(idx) {
        const col = idx % this.cols;
        return gridCenterXAtOrigin(col, this.minX, this.cellHalfSize);
    }
    gridCenterYByIdx(idx) {
        const row = (idx / this.cols) | 0;
        return gridCenterYAtOrigin(row, this.minY, this.cellHalfSize);
    }
    idx(col, row) {
        return row * this.cols + col;
    }
    worldToIdx(x, y) {
        const col = this.worldCol(x);
        const row = this.worldRow(y);
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return -1;
        const idx = row * this.cols + col;
        if (!cellInRect(idx, this)) return -1;
        return idx;
    }
    isBlockedIdx(idx) {
        if (idx < 0 || idx >= this.grid.length) return true;
        return this.grid[idx] !== 0;
    }
    isBlockedWorld(x, y) {
        return this.isBlockedIdx(this.worldToIdx(x, y));
    }
    canStep(fromIdx, toIdx, navTopology = null) {
        if (!navTopology) return false;
        return navTopology.canStep(fromIdx, toIdx);
    }
    getCellBoundsByIdxF32(buf, o, idx) {
        const cols = this.cols;
        const minX = this.minX + (idx % cols) * this.cellSize;
        const minY = this.minY + ((idx / cols) | 0) * this.cellSize;
        buf[o] = minX;
        buf[o + 1] = minY;
        buf[o + 2] = minX + this.cellSize;
        buf[o + 3] = minY + this.cellSize;
    }
}
let entityGridQueryGen = 1;
export class EntityGrid {
    constructor(cellSize) {
        this.cellSize = cellSize;
        this.minX = 0;
        this.minY = 0;
        this.cols = 0;
        this.rows = 0;
        this.cellHead = new Int32Array(0);
        this.entityNext = entityNext;
        this.activeEids = new Int32Array(256);
        this.activeEidCount = 0;
        this.queryGen = 0;
        this.maxInsertedExtent = 0;
        this._eidCollectScratch = new Int32Array(256);
    }
    syncBounds(obstacleGrid) {
        if (!obstacleGrid) return;
        const width = obstacleGrid.maxX - obstacleGrid.minX;
        const height = obstacleGrid.maxY - obstacleGrid.minY;
        const cols = Math.ceil(width / this.cellSize);
        const rows = Math.ceil(height / this.cellSize);
        if (this.minX === obstacleGrid.minX && this.minY === obstacleGrid.minY && this.cols === cols && this.rows === rows) return;
        this.minX = obstacleGrid.minX;
        this.minY = obstacleGrid.minY;
        this.cols = cols;
        this.rows = rows;
        const size = this.cols * this.rows;
        if (this.cellHead.length < size) this.cellHead = new Int32Array(size);
        this.cellHead.fill(-1);
    }
    clear() {
        for (let i = 0; i < this.activeEidCount; i++) {
            const eid = this.activeEids[i];
            const tile = entityGridTileIdx[eid];
            if (tile !== -1) {
                this.cellHead[tile] = -1;
                this.entityNext[eid] = -1;
                entityGridTileIdx[eid] = -1;
            }
        }
        this.activeEidCount = 0;
        this.maxInsertedExtent = 0;
    }
    _getCellIndex(x, y) {
        const col = Math.floor((x - this.minX) / this.cellSize);
        const row = Math.floor((y - this.minY) / this.cellSize);
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return -1;
        const idx = col + row * this.cols;
        if (!cellInRect(idx, this)) return -1;
        return idx;
    }
    _ensureActiveEidCap(n) {
        ensureGrowI32(this, "activeEids", n);
    }
    insert(eid) {
        const x = entityX[eid];
        const y = entityY[eid];
        entityAlive[eid] = 1;
        entitySpatialGen[eid] = 0;
        const idx = this._getCellIndex(x, y);
        entityGridTileIdx[eid] = idx;
        this._ensureActiveEidCap(this.activeEidCount + 1);
        this.activeEids[this.activeEidCount++] = eid;
        let extent = slabCollisionSpan(eid);
        if (!(extent > 0)) extent = entityR[eid];
        if (extent > this.maxInsertedExtent) this.maxInsertedExtent = extent;
        if (idx !== -1) {
            this.entityNext[eid] = this.cellHead[idx];
            this.cellHead[idx] = eid;
        } else this.entityNext[eid] = -1;
    }
    remove(eid) {
        const idx = entityGridTileIdx[eid];
        if (idx === -1 || idx < 0 || idx >= this.cellHead.length) return;
        let curr = this.cellHead[idx];
        let prev = -1;
        while (curr !== -1 && curr !== undefined) {
            if (curr === eid) {
                if (prev !== -1) this.entityNext[prev] = this.entityNext[curr];
                else this.cellHead[idx] = this.entityNext[curr];
                this.entityNext[curr] = -1;
                break;
            }
            prev = curr;
            curr = this.entityNext[curr];
        }
        entityGridTileIdx[eid] = -1;
        const active = this.activeEids;
        for (let i = 0; i < this.activeEidCount; i++) {
            if (active[i] !== eid) continue;
            active[i] = active[--this.activeEidCount];
            break;
        }
    }
    forEachEidInBoundsF32(buf, o, excludeEid, queryGen, fn) {
        const stamp = queryGen || (entityGridQueryGen = (entityGridQueryGen + 1) | 0);
        const minCol = Math.max(0, Math.floor((buf[o] - this.minX) / this.cellSize));
        const maxCol = Math.min(this.cols - 1, Math.floor((buf[o + 2] - this.minX) / this.cellSize));
        const minRow = Math.max(0, Math.floor((buf[o + 1] - this.minY) / this.cellSize));
        const maxRow = Math.min(this.rows - 1, Math.floor((buf[o + 3] - this.minY) / this.cellSize));
        if (minCol > maxCol || minRow > maxRow) return;
        const cellHead = this.cellHead;
        const entityNext = this.entityNext;
        const cols = this.cols;
        for (let row = minRow; row <= maxRow; row++) {
            const rowOffset = row * cols;
            for (let col = minCol; col <= maxCol; col++) {
                const cellIdx = rowOffset + col;
                let curr = cellHead[cellIdx];
                if (curr === -1) continue;
                while (curr !== -1) {
                    if (curr !== excludeEid && entitySpatialGen[curr] !== stamp) {
                        entitySpatialGen[curr] = stamp;
                        fn(curr);
                    }
                    curr = entityNext[curr];
                }
            }
        }
    }
    collectNearbyEidsInto(eid, outEids, outCap, outStart = 0) {
        let span = slabCollisionSpan(eid);
        if (!(span > 0)) span = entityR[eid];
        const searchRadius = span + this.maxInsertedExtent + neighborQueryPadForExtent(span);
        centerReachAabbF32(ENGINE_F32, ENGINE_BOUNDS_BASE + B_PAD, entityX[eid], entityY[eid], searchRadius);
        return this.collectEidsInBoundsF32(ENGINE_F32, ENGINE_BOUNDS_BASE + B_PAD, outEids, outStart, outCap, eid);
    }
    collectEidsInBoundsF32(buf, o, outEids, outStart, outCap, excludeEid = -1) {
        const stamp = (entityGridQueryGen = (entityGridQueryGen + 1) | 0);
        this.queryGen = stamp;
        let write = 0;
        const minCol = Math.max(0, Math.floor((buf[o] - this.minX) / this.cellSize));
        const maxCol = Math.min(this.cols - 1, Math.floor((buf[o + 2] - this.minX) / this.cellSize));
        const minRow = Math.max(0, Math.floor((buf[o + 1] - this.minY) / this.cellSize));
        const maxRow = Math.min(this.rows - 1, Math.floor((buf[o + 3] - this.minY) / this.cellSize));
        if (minCol > maxCol || minRow > maxRow) return 0;
        const cellHead = this.cellHead;
        const entityNext = this.entityNext;
        const cols = this.cols;
        for (let row = minRow; row <= maxRow; row++) {
            const rowOffset = row * cols;
            for (let col = minCol; col <= maxCol; col++) {
                let curr = cellHead[rowOffset + col];
                while (curr !== -1) {
                    if (curr !== excludeEid && entitySpatialGen[curr] !== stamp) {
                        entitySpatialGen[curr] = stamp;
                        if (write >= outCap) return -1;
                        outEids[outStart + write++] = curr;
                    }
                    curr = entityNext[curr];
                }
            }
        }
        return write;
    }
}
/**
 * Estimate travel distance for a rolling body with initial speed v0 under friction damping.
 */
export function estimateRollingTravelDistance(v0, eid) {
    const fBase = primitiveDragFrictionEid(eid);
    const fLow = 2.8;
    const vTh = 10;
    const sC = 1.8;
    if (v0 <= sC) return 0;
    const b = fLow - fBase;
    // Two-regime damping only applies when low-speed friction exceeds base (pool balls).
    // Most sandbox props use high base friction; fall back to constant damping.
    if (b <= 1e-5) return (v0 - sC) / fBase;
    if (v0 >= vTh) {
        const d1 = (v0 - vTh) / fBase;
        const a = fBase;
        const uMax = 1 - sC / vTh;
        const d2 = (vTh / Math.sqrt(a * b)) * Math.atan(uMax * Math.sqrt(b / a));
        return d1 + d2;
    }
    const a = fBase;
    const uMax = 1 - sC / vTh;
    const uMin = 1 - v0 / vTh;
    const factor = vTh / Math.sqrt(a * b);
    const k = Math.sqrt(b / a);
    return factor * (Math.atan(uMax * k) - Math.atan(uMin * k));
}
/** Aim arrow segment for a circle shot — writes x1,y1,x2,y2 at buf[o..o+3]. */
export function computeCircleAimLineSegmentInto(buf, o, originX, originY, radius, nx, ny, maxTravelDist, maxRayDist = 2400, obstacleGrid = null) {
    const len = Math.hypot(nx, ny);
    if (len < 1e-6) return false;
    const dx = nx / len;
    const dy = ny / len;
    const angle = Math.atan2(dy, dx);
    let stopDist = Math.min(maxRayDist, maxTravelDist);
    castSteppedCircleRay(originX, originY, angle, maxRayDist, radius, obstacleGrid);
    const wallDist = ENGINE_F32[S_OUT_RAY_DIST];
    if (wallDist < stopDist) stopDist = wallDist;
    circleLeadingPoint(originX, originY, radius, dx, dy, P_VEC_A);
    buf[o] = ENGINE_F32[P_VEC_A];
    buf[o + 1] = ENGINE_F32[P_VEC_A + 1];
    buf[o + 2] = originX + dx * (stopDist + radius);
    buf[o + 3] = originY + dy * (stopDist + radius);
    return true;
}
// ==========================================
// 1. Ray Circle Hit Distance (from circleCast.js)
// ==========================================
export function rayCircleHitDistance(ox, oy, dx, dy, cx, cy, hitRadius) {
    const fx = ox - cx;
    const fy = oy - cy;
    const a = dx * dx + dy * dy;
    if (a < 1e-10) return null;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - hitRadius * hitRadius;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const sqrt = Math.sqrt(disc);
    const inv2a = 1 / (2 * a);
    const t1 = (-b - sqrt) * inv2a;
    const t2 = (-b + sqrt) * inv2a;
    const epsilon = 1e-4;
    if (t1 >= epsilon) return t1;
    if (t2 >= epsilon) return t2;
    return null;
}
// ==========================================
// 2. Wall Segment Query (from wallSegmentQuery.js)
// ==========================================
export function resolveWallSegmentQueryRadius(obstacleGrid, ...clearanceRadii) {
    const clearance = Math.max(...clearanceRadii, 0);
    return Math.max(clearance, obstacleGrid.cellSize + clearance);
}
const alongLineSeenGen = new Uint8Array(MAX_STATIC_WALL_SEGMENTS);
let alongLineSeenStamp = 1;
export function collectWallSegmentsAlongLine(obstacleGrid, x1, y1, x2, y2, queryRadius) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const steps = Math.max(2, Math.ceil(len / 8));
    alongLineSeenStamp++;
    if (alongLineSeenStamp > 255) {
        alongLineSeenGen.fill(0);
        alongLineSeenStamp = 1;
    }
    const stamp = alongLineSeenStamp;
    const result = new GrowI32(32);
    const batch = new GrowI32(32);
    for (let step = 0; step <= steps; step++) {
        const t = step / steps;
        batch.clear();
        obstacleGrid.appendStaticWallSegmentsNearWorld(x1 + dx * t, y1 + dy * t, queryRadius, batch);
        for (let i = 0; i < batch.used; i++) {
            const id = batch.buf[i];
            if (alongLineSeenGen[id] === stamp) continue;
            alongLineSeenGen[id] = stamp;
            result.push(id);
        }
    }
    return result;
}
// ==========================================
// 3. Line of Sight (from lineOfSight.js)
// ==========================================
export function hasLineOfSight(x1, y1, x2, y2, obstacleGrid, sourceRadius = 0, targetRadius = sourceRadius) {
    const corridorRadius = Math.max(sourceRadius, targetRadius);
    const segmentQueryRadius = resolveWallSegmentQueryRadius(obstacleGrid, corridorRadius);
    const candidateWalls = collectWallSegmentsAlongLine(obstacleGrid, x1, y1, x2, y2, segmentQueryRadius);
    for (let i = 0; i < candidateWalls.used; i++) if (minDistanceSegmentToWall(x1, y1, x2, y2, candidateWalls.buf[i]) <= corridorRadius) return false;
    return true;
}
// ==========================================
// 4. Stepped Circle Ray Cast (from steppedCircleRayCast.js)
// ==========================================
function findFirstCircleSegmentHit(cx, cy, radius, segIds) {
    if (!segIds || segIds.used === 0) return -1;
    const slab = staticWallSegmentSlab;
    for (let i = 0; i < segIds.used; i++) {
        const id = segIds.buf[i];
        const dx = cx - slab.x[id];
        const dy = cy - slab.y[id];
        const maxDist = radius + slab.size[id] * 0.75;
        if (Math.abs(dx) > maxDist || Math.abs(dy) > maxDist) continue;
        if (circleIntersectsSegment(cx, cy, radius, id)) return id;
    }
    return -1;
}
const DEFAULT_STEP = 8;
function collectCandidateWalls(startX, startY, dx, dy, maxDist, obstacleGrid, queryRadius) {
    if (!obstacleGrid) return EMPTY_WALL_CANDIDATES;
    const endX = startX + dx * maxDist;
    const endY = startY + dy * maxDist;
    return collectWallSegmentsAlongLine(obstacleGrid, startX, startY, endX, endY, queryRadius);
}
function rayCircleHitsWall(cx, cy, radius, candidateWalls) {
    return findFirstCircleSegmentHit(cx, cy, radius, candidateWalls) >= 0;
}
function writeCircleRayHit(hit, x, y, dist) {
    ENGINE_I32[I_OUT_RAY_HIT] = hit;
    ENGINE_F32[S_OUT_RAY_X] = x;
    ENGINE_F32[S_OUT_RAY_Y] = y;
    ENGINE_F32[S_OUT_RAY_DIST] = dist;
}
/** March a circle along a ray; writes CIRCLE_RAY_HIT_* + x/y/dist into ENGINE_I32/F32 outs. */
export function castSteppedCircleRay(startX, startY, angle, maxDist, radius, obstacleGrid = null, step = DEFAULT_STEP, wallQueryRadius = radius) {
    let dist = 0;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let cx = startX;
    let cy = startY;
    const candidateWalls = collectCandidateWalls(startX, startY, dx, dy, maxDist, obstacleGrid, wallQueryRadius);
    while (dist < maxDist) {
        cx += dx * step;
        cy += dy * step;
        dist += step;
        if (rayCircleHitsWall(cx, cy, radius, candidateWalls)) {
            let hitWall = true;
            while (hitWall && dist > 0) {
                cx -= dx;
                cy -= dy;
                dist -= 1;
                hitWall = rayCircleHitsWall(cx, cy, radius, candidateWalls);
            }
            writeCircleRayHit(CIRCLE_RAY_HIT_WALL, cx, cy, dist);
            return;
        }
    }
    writeCircleRayHit(CIRCLE_RAY_HIT_NONE, cx, cy, dist);
}
const MAX_WALL_BUCKETS = 4096;
const BUCKET_MASK = MAX_WALL_BUCKETS - 1;
const EMPTY_STAMP = -1;
const sWallBucketKey = new Int32Array(2);
const sWallBucketHitSlot = new Int32Array(2);
export function wallBucketKeyPartsInto(buf, o, grid, worldX, worldY, queryRadius) {
    const col = grid.worldCol(worldX);
    const row = grid.worldRow(worldY);
    const pad = 1 + Math.ceil(queryRadius / grid.cellSize);
    buf[o] = (col & 0xffff) | ((row & 0xffff) << 16);
    buf[o + 1] = pad & 0xff;
}
function bucketSlotForKey(keyLo, keyHi) {
    return (keyLo ^ (keyHi * 0x9e3779b9)) & BUCKET_MASK;
}
function acquireBucketSegIds(slab, slot) {
    let segIds = slab.segIds[slot];
    if (segIds) {
        segIds.clear();
        return segIds;
    }
    segIds = slab.segIdPool.pop();
    if (!segIds) segIds = new GrowI32(32);
    else segIds.clear();
    slab.segIds[slot] = segIds;
    return segIds;
}
export function createWallCandidateBucketSlab() {
    const frameStamp = new Int32Array(MAX_WALL_BUCKETS);
    frameStamp.fill(EMPTY_STAMP);
    return { keyLo: new Int32Array(MAX_WALL_BUCKETS), keyHi: new Int32Array(MAX_WALL_BUCKETS), frameStamp, revisionStamp: new Int32Array(MAX_WALL_BUCKETS), segIds: new Array(MAX_WALL_BUCKETS), segIdPool: [] };
}
export function resetWallCandidateBucketSlab(slab) {
    for (let i = 0; i < MAX_WALL_BUCKETS; i++) {
        if (slab.frameStamp[i] === EMPTY_STAMP) continue;
        const segIds = slab.segIds[i];
        if (segIds) {
            segIds.clear();
            slab.segIdPool.push(segIds);
            slab.segIds[i] = null;
        }
        slab.frameStamp[i] = EMPTY_STAMP;
    }
}
export function invalidateWallCandidateBucketFrame(slab) {
    slab.frameStamp.fill(EMPTY_STAMP);
}
export function lookupWallCandidateBucketInto(outHitSlot, slab, keyLo, keyHi, frameId, revision) {
    let slot = bucketSlotForKey(keyLo, keyHi);
    for (let probe = 0; probe < MAX_WALL_BUCKETS; probe++) {
        const idx = (slot + probe) & BUCKET_MASK;
        const stamp = slab.frameStamp[idx];
        if (stamp === EMPTY_STAMP) {
            outHitSlot[0] = 0;
            outHitSlot[1] = idx;
            return acquireBucketSegIds(slab, idx);
        }
        if (slab.keyLo[idx] === keyLo && slab.keyHi[idx] === keyHi) {
            if (slab.revisionStamp[idx] === revision && stamp === frameId) {
                outHitSlot[0] = 1;
                outHitSlot[1] = idx;
                return slab.segIds[idx];
            }
            outHitSlot[0] = 0;
            outHitSlot[1] = idx;
            return acquireBucketSegIds(slab, idx);
        }
    }
    throw new Error("wall candidate bucket slab full");
}
export function commitWallCandidateBucket(slab, slot, keyLo, keyHi, frameId, revision, segIds) {
    slab.keyLo[slot] = keyLo;
    slab.keyHi[slot] = keyHi;
    slab.frameStamp[slot] = frameId;
    slab.revisionStamp[slot] = revision;
    slab.segIds[slot] = segIds;
}
/**
 * Packed (col, row) key for sparse unbounded grids.
 *
 * World AABB → cell index range uses minCol/maxCol/minRow/maxRow via boundsToCellRectInto.
 * Wall bake / obstacle patches use startCol/endCol/startRow/endRow — same indices as {@link CellBounds} in CellRect.js.
 */
export const KEY_STRIDE = 65536;
const EDGE_KEY_STRIDE = KEY_STRIDE * KEY_STRIDE;
/** Keys at or above this value are packed edge zone ids (`packEdgeCellKey`). */
export const EDGE_ZONE_KEY_MIN = EDGE_KEY_STRIDE;
export function packCellKey(col, row) {
    return col + row * KEY_STRIDE;
}
/** Sparse health for railWall edges — side encoded above cell row/col key space. */
export function packEdgeCellKey(col, row, side) {
    return packCellKey(col, row) + (side + 1) * EDGE_KEY_STRIDE;
}
/** @param {number} key from `packEdgeCellKey` */
/** @param {number} key */
export function boundsToCellRectInto(i32, o, minX, minY, maxX, maxY, cellSize) {
    i32[o] = Math.floor(minX / cellSize);
    i32[o + 1] = Math.floor(maxX / cellSize);
    i32[o + 2] = Math.floor(minY / cellSize);
    i32[o + 3] = Math.floor(maxY / cellSize);
}
/** @typedef {{ startCol: number, endCol: number, startRow: number, endRow: number }} CellBounds */
export function emptyCellBounds() {
    return { startCol: Infinity, endCol: -Infinity, startRow: Infinity, endRow: -Infinity };
}
/** @param {CellBounds} bounds */
export function isEmptyCellBounds(bounds) {
    return bounds.startCol === Infinity;
}
/** @param {CellBounds} bounds */
export function clampCellBoundsInPlace(bounds, grid) {
    const cols = grid.cols;
    const rows = grid.rows;
    if (bounds.startCol < 0) bounds.startCol = 0;
    if (bounds.endCol > cols - 1) bounds.endCol = cols - 1;
    if (bounds.startRow < 0) bounds.startRow = 0;
    if (bounds.endRow > rows - 1) bounds.endRow = rows - 1;
    return bounds;
}
export function cellBoundsForGrid(grid) {
    return { startCol: 0, endCol: grid.cols - 1, startRow: 0, endRow: grid.rows - 1 };
}
/** @param {CellBounds} bounds */
export function padCellBoundsInPlace(bounds, grid, padding = 0) {
    const cols = grid.cols;
    const rows = grid.rows;
    bounds.startCol = Math.max(0, bounds.startCol - padding);
    bounds.endCol = Math.min(cols - 1, bounds.endCol + padding);
    bounds.startRow = Math.max(0, bounds.startRow - padding);
    bounds.endRow = Math.min(rows - 1, bounds.endRow + padding);
    return bounds;
}
export function padCellIdxToGrid(idx, grid, padding = 0) {
    const cols = grid.cols;
    const rows = grid.rows;
    const col = idx % cols;
    const row = (idx / cols) | 0;
    return { startCol: Math.max(0, col - padding), endCol: Math.min(cols - 1, col + padding), startRow: Math.max(0, row - padding), endRow: Math.min(rows - 1, row + padding) };
}
export function growCellBoundsIdx(bounds, idx, grid) {
    const cols = grid.cols;
    const col = idx % cols;
    const row = (idx / cols) | 0;
    if (col < bounds.startCol) bounds.startCol = col;
    if (col > bounds.endCol) bounds.endCol = col;
    if (row < bounds.startRow) bounds.startRow = row;
    if (row > bounds.endRow) bounds.endRow = row;
    return bounds;
}
export function unionCellBounds(a, b) {
    if (!a) return b;
    if (!b) return a;
    return { startCol: a.startCol < b.startCol ? a.startCol : b.startCol, endCol: a.endCol > b.endCol ? a.endCol : b.endCol, startRow: a.startRow < b.startRow ? a.startRow : b.startRow, endRow: a.endRow > b.endRow ? a.endRow : b.endRow };
}
/** Iterate sparse grid cells; fn(col, row, packedKey). */
export function forEachSparseCellInRect(minCol, maxCol, minRow, maxRow, fn) {
    for (let r = minRow; r <= maxRow; r++) {
        const rowKey = r * KEY_STRIDE;
        for (let c = minCol; c <= maxCol; c++) fn(c, r, c + rowKey);
    }
}
/** Iterate dense grid cells; fn(cellIndex). */
export function forEachDenseCellInRect(grid, startCol, endCol, startRow, endRow, fn) {
    forEachCellInColRowBounds(startCol, endCol, startRow, endRow, grid.cols, (c, r, idx) => fn(idx));
}
export function forEachDenseCellInBounds(grid, bounds, fn) {
    forEachDenseCellInRect(grid, bounds.startCol, bounds.endCol, bounds.startRow, bounds.endRow, fn);
}
const EDGE_SIDE_LABELS = ["North (+Y)", "East (+X)", "South (-Y)", "West (-X)"];
export function formatGridWallEdgeSideLabel(side) {
    return EDGE_SIDE_LABELS[side] ?? `Side ${side}`;
}
export function hitTestRailWallEdgeAtWorld(grid, worldX, worldY, hitWorld = grid.cellSize * 0.25) {
    const idx = grid.worldToIdx(worldX, worldY);
    if (idx === -1) return null;
    const cols = grid.cols;
    const minX = grid.minX + (idx % cols) * grid.cellSize;
    const minY = grid.minY + ((idx / cols) | 0) * grid.cellSize;
    const localX = worldX - minX;
    const localY = worldY - minY;
    const cellSize = grid.cellSize;
    const dists = [localY, cellSize - localX, cellSize - localY, localX];
    let bestSide = -1;
    let bestDist = hitWorld;
    for (let side = 0; side < 4; side++)
        if (dists[side] <= bestDist) {
            bestDist = dists[side];
            bestSide = side;
        }
    if (bestSide < 0) return null;
    return { idx, side: bestSide };
}
export function ensureObstacleGridAtWorld(grid, worldX, worldY) {
    centeredAabbF32(ENGINE_F32, ENGINE_BOUNDS_BASE + B_CELL, worldX, worldY, grid.cellSize, grid.cellSize);
    grid.expandToCoverAabbF32(ENGINE_F32, ENGINE_BOUNDS_BASE + B_CELL);
    return grid.worldToIdx(worldX, worldY);
}
const RAIL_WALL_STRIDE = 4;
export class RailWallBatch {
    constructor(cellCapacity) {
        this.data = new Int32Array(cellCapacity * RAIL_WALL_STRIDE * 2);
        this.count = 0;
    }
    add(idx, side, heightLevel, thicknessLevel) {
        const o = this.count << 2;
        this.data[o] = idx;
        this.data[o + 1] = side;
        this.data[o + 2] = heightLevel;
        this.data[o + 3] = thicknessLevel;
        this.count++;
    }
    compactInPlace(keep) {
        let write = 0;
        for (let i = 0; i < this.count; i++) {
            const o = i << 2;
            if (!keep(this.data[o], this.data[o + 1])) continue;
            if (write !== i) this.data.copyWithin(write << 2, o, o + RAIL_WALL_STRIDE);
            write++;
        }
        this.count = write;
    }
    static single(idx, side, heightLevel = 1, thicknessLevel = 1) {
        const batch = new RailWallBatch(1);
        batch.add(idx, side, heightLevel, thicknessLevel);
        return batch;
    }
}
export function clearRailWallsQuiet(state, rails) {
    const grid = state.obstacleGrid;
    const bounds = emptyCellBounds();
    let changed = false;
    for (let i = 0; i < rails.count; i++) {
        const o = i << 2;
        const idx = rails.data[o];
        const side = rails.data[o + 1];
        if (!clearPrimaryBoundaryAt(state, idx, side)) continue;
        changed = true;
        growCellBoundsIdx(bounds, idx, grid);
    }
    if (!changed) return null;
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH_WALL);
    return bounds;
}
export function stampRailWallsQuiet(state, railWalls) {
    const grid = state.obstacleGrid;
    const settings = state.worldSurfaces.settings;
    const bounds = emptyCellBounds();
    let changed = false;
    for (let i = 0; i < railWalls.count; i++) {
        const o = i << 2;
        const idx = railWalls.data[o];
        const col = idx % grid.cols;
        const row = (idx / grid.cols) | 0;
        if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) continue;
        const side = railWalls.data[o + 1];
        clearPrimaryBoundaryAt(state, idx, side);
        const heightLevel = clampStampWallHeightLevel(railWalls.data[o + 2], settings);
        const thicknessLevel = railWalls.data[o + 3];
        setBoundary(grid, idx, side, heightLevel, thicknessLevel);
        changed = true;
        growCellBoundsIdx(bounds, idx, grid);
    }
    if (!changed) return { bounds: null, stamped: null };
    return { bounds, stamped: railWalls };
}
export function commitGridWallBatch(state, bounds) {
    if (!bounds || isEmptyCellBounds(bounds)) return false;
    const grid = state.obstacleGrid;
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH_WALL);
    padCellBoundsInPlace(bounds, grid, 1);
    commitGridNavEdit(state, bounds);
    return true;
}
export function commitGridWallAtIdx(state, idx) {
    const bounds = emptyCellBounds();
    growCellBoundsIdx(bounds, idx, state.obstacleGrid);
    return commitGridWallBatch(state, bounds);
}
export function clearVoxelWallQuiet(state, idx) {
    const grid = state.obstacleGrid;
    if (!cellIsStaticWallAtIdx(grid, idx)) return false;
    grid.grid[idx] = 0;
    return true;
}
export function clearVoxelWallsQuiet(state, voxelIndices) {
    const grid = state.obstacleGrid;
    const bounds = emptyCellBounds();
    let changed = false;
    for (let i = 0; i < voxelIndices.length; i++) {
        const idx = voxelIndices[i];
        if (!clearVoxelWallQuiet(state, idx)) continue;
        changed = true;
        growCellBoundsIdx(bounds, idx, grid);
    }
    if (!changed) return null;
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH_WALL);
    return bounds;
}
export function clearAllStampedGridWalls(state, { notify = true } = {}) {
    const grid = state.obstacleGrid;
    if (!grid.cols) return;
    const size = grid.cols * grid.rows;
    for (let idx = 0; idx < size; idx++) {
        if (!cellIsStaticWallAtIdx(grid, idx)) continue;
        grid.grid[idx] = 0;
    }
    for (let idx = 0; idx < size; idx++) for (let side = 0; side < 4; side++) clearPrimaryBoundaryAt(state, idx, side);
    if (notify) {
        bumpGridNavEpoch(grid, GRID_NAV_EPOCH_WALL);
        commitGridNavEdit(state, null, { fullNavSync: true });
    }
}
/** Stamp many voxel/rail walls from global grid cells — one cache/nav invalidation at the end. */
export function applyStampedGridWallsFromSnapshot(state, doc) {
    const grid = state.obstacleGrid;
    const settings = state.worldSurfaces.settings;
    const half = grid.cellHalfSize;
    const bounds = emptyCellBounds();
    const cellSize = doc.cellSize ?? grid.cellSize;
    for (let i = 0; i < doc.voxels.length; i++) {
        const { idx: docIdx, heightLevel } = doc.voxels[i];
        const idx = grid.worldToIdx(doc.origin.minX + (docIdx % doc.cols) * cellSize + half, doc.origin.minY + Math.floor(docIdx / doc.cols) * cellSize + half);
        if (idx < 0 || idx >= grid.grid.length) continue;
        grid.grid[idx] = clampStampWallHeightLevel(heightLevel, settings);
        growCellBoundsIdx(bounds, idx, grid);
    }
    for (let i = 0; i < doc.railWalls.length; i++) {
        const { idx: docIdx, side, heightLevel, thicknessLevel } = doc.railWalls[i];
        const idx = grid.worldToIdx(doc.origin.minX + (docIdx % doc.cols) * cellSize + half, doc.origin.minY + Math.floor(docIdx / doc.cols) * cellSize + half);
        if (idx < 0 || idx >= grid.grid.length) continue;
        setBoundary(grid, idx, side, clampStampWallHeightLevel(heightLevel, settings), thicknessLevel);
        growCellBoundsIdx(bounds, idx, grid);
    }
    if (isEmptyCellBounds(bounds)) return null;
    return bounds;
}
export function stampVoxelWallAt(state, idx, heightLevel) {
    const grid = state.obstacleGrid;
    const level = clampStampWallHeightLevel(heightLevel, state.worldSurfaces.settings);
    grid.grid[idx] = level;
    return commitGridWallAtIdx(state, idx);
}
export function clearVoxelWallAt(state, idx) {
    const grid = state.obstacleGrid;
    if (!cellIsStaticWallAtIdx(grid, idx)) return false;
    grid.grid[idx] = 0;
    return commitGridWallAtIdx(state, idx);
}
export function setVoxelWallHeightAt(state, idx, heightLevel) {
    const grid = state.obstacleGrid;
    if (!cellIsStaticWall(grid, idx)) return false;
    const level = clampStampWallHeightLevel(heightLevel, state.worldSurfaces.settings);
    if (grid.grid[idx] === level) return true;
    grid.grid[idx] = level;
    return commitGridWallAtIdx(state, idx);
}
export function stampRailWallAt(state, idx, side, heightLevel, thicknessLevel) {
    const grid = state.obstacleGrid;
    clearPrimaryBoundaryAt(state, idx, side);
    const level = clampStampWallHeightLevel(heightLevel, state.worldSurfaces.settings);
    setBoundary(grid, idx, side, level, thicknessLevel, true);
    return commitGridWallAtIdx(state, idx);
}
export function clearRailWallAt(state, idx, side) {
    if (!clearPrimaryBoundaryAt(state, idx, side, true)) return false;
    const grid = state.obstacleGrid;
    return commitGridWallAtIdx(state, idx);
}
export function listPlacedVoxelWalls(grid) {
    /** @type {{ col: number, row: number, heightLevel: number, label: string }[]} */
    const placed = [];
    const counts = new Map();
    const size = grid.cols * grid.rows;
    for (let idx = 0; idx < size; idx++) {
        if (!cellIsStaticWallAtIdx(grid, idx)) continue;
        const heightLevel = grid.grid[idx];
        const index = (counts.get(heightLevel) ?? 0) + 1;
        counts.set(heightLevel, index);
        const voxelObj = { idx, heightLevel, label: `Voxel #${index} · height ${heightLevel}` };
        placed.push(voxelObj);
    }
    return placed;
}
export function listPlacedRailWalls(grid) {
    const placed = [];
    const counts = new Map();
    forEachCellEdge(
        grid,
        (idx, side, edge) => {
            const capLevel = railWallCapLevel(edge, neighborFillLevel(grid, idx, side));
            const thicknessLevel = railWallEdgeThicknessLevel(edge);
            const key = `${side}:${capLevel}:${thicknessLevel}`;
            const index = (counts.get(key) ?? 0) + 1;
            counts.set(key, index);
            const railObj = { idx, side, heightLevel: capLevel, thicknessLevel, label: `Rail #${index} · ${formatGridWallEdgeSideLabel(side)} · height ${capLevel}` };
            placed.push(railObj);
        },
        { filter: isRailWallEdge },
    );
    return placed;
}
export function getVoxelWallInfo(grid, idx) {
    if (!cellIsStaticWall(grid, idx)) return null;
    return { idx, heightLevel: grid.grid[idx] };
}
export function getRailWallInfo(grid, idx, side) {
    const edge = grid.getCellEdge(idx, side);
    if (!isRailWallEdge(edge)) return null;
    const heightLevel = railWallCapLevel(edge, neighborFillLevel(grid, idx, side));
    return { idx, side, heightLevel, thicknessLevel: railWallEdgeThicknessLevel(edge), sideLabel: formatGridWallEdgeSideLabel(side) };
}
export function clearPrimaryBoundaryAt(state, idx, side, bumpRevision = false) {
    const grid = state.obstacleGrid;
    if (!isRailWallEdge(grid.getCellEdge(idx, side))) return false;
    clearBoundaryPrimary(grid, idx, side, bumpRevision);
    return true;
}
export function createDeferredGridWallCommit(state) {
    const pending = new Set();
    return {
        get hasPending() {
            return pending.size > 0;
        },
        clearVoxel(idx) {
            if (!clearVoxelWallQuiet(state, idx)) return false;
            pending.add(idx);
            return true;
        },
        clearVoxels(voxelIndices) {
            let changed = false;
            for (let i = 0; i < voxelIndices.length; i++)
                if (clearVoxelWallQuiet(state, voxelIndices[i])) {
                    pending.add(voxelIndices[i]);
                    changed = true;
                }
            if (changed) bumpGridNavEpoch(state.obstacleGrid, GRID_NAV_EPOCH_WALL);
            return changed;
        },
        clearRails(rails) {
            let changed = false;
            for (let i = 0; i < rails.count; i++) {
                const o = i << 2;
                const idx = rails.data[o];
                const side = rails.data[o + 1];
                if (clearPrimaryBoundaryAt(state, idx, side)) {
                    pending.add(idx);
                    changed = true;
                }
            }
            if (changed) bumpGridNavEpoch(state.obstacleGrid, GRID_NAV_EPOCH_WALL);
            return changed;
        },
        clearWalls({ voxels = [], rails = [] } = {}) {
            let changed = false;
            if (this.clearVoxels(voxels)) changed = true;
            if (this.clearRails(rails)) changed = true;
            return changed;
        },
        flush() {
            if (!pending.size) return false;
            const bounds = emptyCellBounds();
            for (const idx of pending) growCellBoundsIdx(bounds, idx, state.obstacleGrid);
            commitGridWallBatch(state, bounds);
            pending.clear();
            return true;
        },
    };
}
/**
 * Schedule one worker nav resync after grid edits (walls, belts, boundaries).
 * Grid writes must bump the relevant epoch channels before calling this.
 * `region` is null (full grid when fullNavSync), a cell index, or CellBounds.
 */
export function commitGridNavEdit(state, region, { invalidateSurfaces = true, fullNavSync = false } = {}) {
    const grid = state.obstacleGrid;
    if (!fullNavSync && region === null) return Promise.resolve();
    if (invalidateSurfaces && state.worldSurfaces)
        if (fullNavSync || region === null) state.worldSurfaces.invalidateGridBounds(null, grid);
        else state.worldSurfaces.invalidateGridBounds(region, grid);
    if (state.editor != null || state.appLaunch != null) rebuildLabMapCaches(state);
    if (state.editor?.navWalkableCellsCache) patchNavWalkableCellIndex(state, fullNavSync ? null : region);
    const nav = state.nav;
    return nav.commitEdit(region, { fullNavSync });
}
export function commitSurfaceMaterialEdit(state, idx) {
    if (state.worldSurfaces) state.worldSurfaces.invalidateGridBounds(idx, state.obstacleGrid);
    if (state.editor != null || state.appLaunch != null) rebuildLabMapCaches(state);
    return idx;
}
/** Stamp or replace one floor cell and resync nav topology. */
export function applyFloorCellEdit(state, idx, packed) {
    if (!state.obstacleGrid.writeFloorCell(idx, packed)) return null;
    return commitGridNavEdit(state, idx);
}
/** Clear one floor cell and resync nav topology. */
export function clearFloorCellNavEdit(state, idx) {
    if (!state.obstacleGrid.clearFloorCell(idx)) return null;
    return commitGridNavEdit(state, idx);
}
export const DEFAULT_WALL_THRESHOLD = 5;
export function fillRandomGrid(cols, rows, fillChance, out) {
    const cells = out ?? new Uint8Array(cols * rows);
    for (let i = 0; i < cells.length; i++) cells[i] = Math.random() < fillChance ? 1 : 0;
    return cells;
}
export function runCellularAutomata(cols, rows, cells, { iterations, wallThreshold = DEFAULT_WALL_THRESHOLD, scratch }) {
    let next = scratch ?? new Uint8Array(cols * rows);
    for (let iter = 0; iter < iterations; iter++) {
        for (let r = 0; r < rows; r++)
            for (let c = 0; c < cols; c++) {
                let wallsCount = 0;
                for (let dr = -1; dr <= 1; dr++)
                    for (let dc = -1; dc <= 1; dc++) {
                        const nr = r + dr;
                        const nc = c + dc;
                        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                            if (cells[nr * cols + nc] === 1) wallsCount++;
                        } else wallsCount++;
                    }
                next[r * cols + c] = wallsCount >= wallThreshold ? 1 : 0;
            }
        const temp = cells;
        cells = next;
        next = temp;
    }
    return cells;
}
export function generateCellularAutomataGrid(cols, rows, { fillChance, iterations, wallThreshold = DEFAULT_WALL_THRESHOLD }) {
    let cells = fillRandomGrid(cols, rows, fillChance);
    return runCellularAutomata(cols, rows, cells, { iterations, wallThreshold, scratch: new Uint8Array(cols * rows) });
}
function clearCavernOccupancyBoundaryStrip(cells, cols, rows, side, stripRows) {
    const depth = Math.max(1, Math.round(stripRows));
    if (side === "south") {
        for (let strip = 0; strip < depth; strip++) {
            const lr = rows - 1 - strip;
            if (lr < 0) break;
            for (let lc = 0; lc < cols; lc++) cells[lr * cols + lc] = 0;
        }
        return;
    }
    if (side === "north")
        for (let strip = 0; strip < depth; strip++) {
            if (strip >= rows) break;
            for (let lc = 0; lc < cols; lc++) cells[strip * cols + lc] = 0;
        }
}
function carveCavernSouthVent(cells, cols, rows, stripRows) {
    const depth = Math.max(1, Math.round(stripRows));
    const startRow = rows - depth;
    const seen = new Uint8Array(cols * rows);
    const queue = [];
    for (let pass = 0; pass < 32; pass++) {
        seen.fill(0);
        const components = [];
        for (let lr = 0; lr < rows; lr++)
            for (let lc = 0; lc < cols; lc++) {
                const idx = lr * cols + lc;
                if (cells[idx] !== 0 || seen[idx]) continue;
                const members = [];
                seen[idx] = 1;
                queue.length = 0;
                queue.push(idx);
                while (queue.length) {
                    const cur = queue.pop();
                    members.push(cur);
                    if (cur % cols > 0) {
                        const left = cur - 1;
                        if (cells[left] === 0 && !seen[left]) {
                            seen[left] = 1;
                            queue.push(left);
                        }
                    }
                    if ((cur + 1) % cols !== 0) {
                        const right = cur + 1;
                        if (cells[right] === 0 && !seen[right]) {
                            seen[right] = 1;
                            queue.push(right);
                        }
                    }
                    if (cur >= cols) {
                        const up = cur - cols;
                        if (cells[up] === 0 && !seen[up]) {
                            seen[up] = 1;
                            queue.push(up);
                        }
                    }
                    if (cur < cols * (rows - 1)) {
                        const down = cur + cols;
                        if (cells[down] === 0 && !seen[down]) {
                            seen[down] = 1;
                            queue.push(down);
                        }
                    }
                }
                let touchesSouth = false;
                for (let i = 0; i < members.length; i++)
                    if (members[i] >= startRow * cols) {
                        touchesSouth = true;
                        break;
                    }
                const compObj = { touchesSouth, sample: members[0] };
                components.push(compObj);
            }
        let carved = false;
        for (let ci = 0; ci < components.length; ci++) {
            const component = components[ci];
            if (component.touchesSouth) continue;
            carved = true;
            const targetRow = (component.sample / cols) | 0;
            const targetCol = component.sample % cols;
            const exitCol = (cols / 2) | 0;
            const exitRow = rows - depth;
            for (let lc = Math.min(exitCol, targetCol); lc <= Math.max(exitCol, targetCol); lc++) cells[exitRow * cols + lc] = 0;
            for (let lr = exitRow; lr <= targetRow; lr++) cells[lr * cols + targetCol] = 0;
        }
        if (!carved) return;
    }
}
export function generateCavernOccupancy(grid, config, { openBoundarySides = null, openBoundaryRows = 1 } = {}) {
    const { originIdx, cols: layoutCols, rows: gridRows, strideCols, cellCount } = stampLayoutFromConfig(grid, config);
    const cols = strideCols;
    const rows = cellCount / strideCols;
    let cells = fillRandomGrid(strideCols, cellCount / strideCols, config.fillChance);
    cells = runCellularAutomata(strideCols, cellCount / strideCols, cells, { iterations: config.iterations, scratch: new Uint8Array(cellCount) });
    applyMapGenShapeMask(grid, cells, originIdx, layoutCols, strideCols, cellCount, config);
    if (openBoundarySides?.south) {
        clearCavernOccupancyBoundaryStrip(cells, cols, rows, "south", openBoundaryRows);
        carveCavernSouthVent(cells, cols, rows, openBoundaryRows);
    }
    if (openBoundarySides?.north) clearCavernOccupancyBoundaryStrip(cells, cols, rows, "north", openBoundaryRows);
    return { originIdx, cols: layoutCols, rows: gridRows, strideCols, cellCount, cells };
}
export function bakeRailMazeDfs(originIdx, layoutCols, strideCols, cellCount, options, mapSeed) {
    const cols = strideCols;
    const rows = cellCount / strideCols;
    const corridorWidthMin = Math.max(1, Math.round(options.corridorWidthMin ?? 1));
    const corridorWidthMax = Math.max(corridorWidthMin, Math.round(options.corridorWidthMax ?? 2));
    const extraLinkRatio = options.extraLinkRatio ?? 0.25;
    const rng = createSeededRng((mapSeed * 16807 + 29) | 0);
    let W_c = corridorWidthMin === corridorWidthMax ? corridorWidthMin : corridorWidthMin + Math.floor(rng() * (corridorWidthMax - corridorWidthMin + 1));
    let numX = Math.floor(cols / W_c);
    let numY = Math.floor(rows / W_c);
    if (numX < 2 || numY < 2) {
        W_c = 1;
        numX = cols;
        numY = rows;
    }
    const verticalWalls = Array.from({ length: numX - 1 }, () => new Uint8Array(numY).fill(1));
    const horizontalWalls = Array.from({ length: numX }, () => new Uint8Array(numY - 1).fill(1));
    const visited = Array.from({ length: numX }, () => new Uint8Array(numY));
    const startX = Math.floor(rng() * numX);
    const startY = Math.floor(rng() * numY);
    visited[startX][startY] = 1;
    const stack = [[startX, startY]];
    while (stack.length > 0) {
        const [cx, cy] = stack[stack.length - 1];
        const neighbors = [];
        if (cy > 0 && !visited[cx][cy - 1]) neighbors.push([cx, cy - 1, "N"]);
        if (cx < numX - 1 && !visited[cx + 1][cy]) neighbors.push([cx + 1, cy, "E"]);
        if (cy < numY - 1 && !visited[cx][cy + 1]) neighbors.push([cx, cy + 1, "S"]);
        if (cx > 0 && !visited[cx - 1][cy]) neighbors.push([cx - 1, cy, "W"]);
        if (neighbors.length > 0) {
            const [nx, ny, dir] = neighbors[Math.floor(rng() * neighbors.length)];
            visited[nx][ny] = 1;
            if (dir === "N") horizontalWalls[cx][cy - 1] = 0;
            else if (dir === "E") verticalWalls[cx][cy] = 0;
            else if (dir === "S") horizontalWalls[cx][cy] = 0;
            else if (dir === "W") verticalWalls[nx][ny] = 0;
            stack.push([nx, ny]);
        } else stack.pop();
    }
    const roomCount = Math.floor(numX * numY * 0.05);
    for (let i = 0; i < roomCount; i++) {
        const rx = Math.floor(rng() * (numX - 1));
        const ry = Math.floor(rng() * (numY - 1));
        verticalWalls[rx][ry] = 0;
        verticalWalls[rx][ry + 1] = 0;
        horizontalWalls[rx][ry] = 0;
        horizontalWalls[rx + 1][ry] = 0;
    }
    for (let lx = 0; lx < numX - 1; lx++) for (let ly = 0; ly < numY; ly++) if (verticalWalls[lx][ly] === 1 && rng() < extraLinkRatio) verticalWalls[lx][ly] = 0;
    for (let lx = 0; lx < numX; lx++) for (let ly = 0; ly < numY - 1; ly++) if (horizontalWalls[lx][ly] === 1 && rng() < extraLinkRatio) horizontalWalls[lx][ly] = 0;
    const heightLevel = options.railWallHeightLevel ?? 1;
    const thicknessLevel = options.railWallThicknessLevel ?? 1;
    const walls = new RailWallBatch(cellCount);
    const pushWall = (localIdx, side) => {
        walls.add(stampGlobalIdx(originIdx, localIdx, layoutCols, cols), side, heightLevel, thicknessLevel);
    };
    for (let r = 0; r < rows; r++) {
        const ly = Math.min(numY - 1, Math.floor(r / W_c));
        for (let c = 0; c < cols; c++) {
            const localIdx = r * cols + c;
            const lx = Math.min(numX - 1, Math.floor(c / W_c));
            if (r !== 0) {
                const ly_up = Math.min(numY - 1, Math.floor((r - 1) / W_c));
                if (ly_up < ly && horizontalWalls[lx][ly_up] === 1) pushWall(localIdx, 0);
            }
            if (r === 0) pushWall(localIdx, 0);
            if (c === 0) pushWall(localIdx, 3);
            else {
                const lx_left = Math.min(numX - 1, Math.floor((c - 1) / W_c));
                if (lx_left < lx && verticalWalls[lx_left][ly] === 1) pushWall(localIdx, 3);
            }
            if (c === cols - 1) pushWall(localIdx, 1);
            if (r === rows - 1) pushWall(localIdx, 2);
        }
    }
    return walls;
}
export function stampGlobalRailWalls(state, rails, { commit = true } = {}) {
    const result = stampRailWallsQuiet(state, rails);
    if (!commit || !result.bounds) return result;
    commitGridNavEdit(state, result.bounds);
    return result;
}
export const MAP_GEN_KINDS = ["cavern", "rail", "railMaze", "erase"];
export const MAP_GEN_SURFACE_REGION_SPECS = [
    { kind: "cavern", editorKey: "cavernConfig", defaultProfile: "tomatoGarden" },
    { kind: "rail", editorKey: "railConfig", defaultProfile: "poolTableFelt" },
    { kind: "railMaze", editorKey: "railMazeConfig", defaultProfile: "cyberGrid" },
];
export const MAP_GEN_OVERLAY_COLORS = { cavern: "#ff9800", rail: "#e040fb", railMaze: "#ba68c8", erase: "#f44336" };
export function createDefaultMapGenBoundsConfig() {
    return { boundsMode: "rect", boundsIdx: 0, boundsCols: 32, boundsRows: 32, centerIdx: 0, outerRadiusCells: 16, donutThicknessCells: 4, stampedBoundsIdx: null, stampedBoundsCols: null, stampedBoundsRows: null };
}
export function hasMapGenStamp(config) {
    return config.stampedBoundsIdx != null && config.stampedBoundsIdx >= 0 && config.stampedBoundsCols != null && config.stampedBoundsRows != null;
}
export function clearMapGenStamp(config) {
    config.stampedBoundsIdx = null;
    config.stampedBoundsCols = null;
    config.stampedBoundsRows = null;
}
function recordMapGenStamp(config) {
    config.stampedBoundsIdx = config.boundsIdx;
    config.stampedBoundsCols = config.boundsCols;
    config.stampedBoundsRows = config.boundsRows;
}
function stampedPaintConfig(config) {
    return { boundsMode: config.boundsMode, boundsIdx: config.stampedBoundsIdx, boundsCols: config.stampedBoundsCols, boundsRows: config.stampedBoundsRows, centerIdx: config.centerIdx, outerRadiusCells: config.outerRadiusCells, donutThicknessCells: config.donutThicknessCells };
}
function remapMapGenStampIdx(config, grid, colOffset, rowOffset, oldCols) {
    if (!hasMapGenStamp(config)) return;
    const oldCol = config.stampedBoundsIdx % oldCols;
    const oldRow = (config.stampedBoundsIdx / oldCols) | 0;
    config.stampedBoundsIdx = grid.worldToIdx(grid.gridCenterX(oldCol + colOffset), grid.gridCenterY(oldRow + rowOffset));
}
export function createMapGenBoundsAabbCache() {
    return { aabb: new Float32Array(4), boundsMode: "", boundsIdx: -1, boundsCols: NaN, boundsRows: NaN, centerIdx: -1, outerRadiusCells: NaN, donutThicknessCells: NaN };
}
export function getInnerRadiusCells(config) {
    if (config.boundsMode !== "donut") return 0;
    return Math.max(0, config.outerRadiusCells - config.donutThicknessCells);
}
export function getMapGenBoundsAabbF32(grid, buf, o, config) {
    const cellSize = grid.cellSize;
    if (config.boundsMode === "rect") {
        const minX = grid.gridCenterXByIdx(config.boundsIdx) - cellSize * 0.5;
        const minY = grid.gridCenterYByIdx(config.boundsIdx) - cellSize * 0.5;
        buf[o] = minX;
        buf[o + 1] = minY;
        buf[o + 2] = minX + config.boundsCols * cellSize;
        buf[o + 3] = minY + config.boundsRows * cellSize;
        return;
    }
    const r = Math.max(1, config.outerRadiusCells) * cellSize;
    const cx = grid.gridCenterXByIdx(config.centerIdx);
    const cy = grid.gridCenterYByIdx(config.centerIdx);
    buf[o] = cx - r;
    buf[o + 1] = cy - r;
    buf[o + 2] = cx + r;
    buf[o + 3] = cy + r;
}
export function getMapGenBoundsCenterWorldF32(buf, o, grid, config) {
    const cellSize = grid.cellSize;
    if (config.boundsMode === "rect") {
        buf[o] = grid.gridCenterXByIdx(config.boundsIdx) + (config.boundsCols - 1) * cellSize * 0.5;
        buf[o + 1] = grid.gridCenterYByIdx(config.boundsIdx) + (config.boundsRows - 1) * cellSize * 0.5;
        return;
    }
    buf[o] = grid.gridCenterXByIdx(config.centerIdx);
    buf[o + 1] = grid.gridCenterYByIdx(config.centerIdx);
}
export function getMapGenBoundsCenterIdx(grid, config) {
    if (config.boundsMode === "rect") return config.boundsIdx + ((config.boundsRows / 2) | 0) * grid.cols + ((config.boundsCols / 2) | 0);
    return config.centerIdx;
}
export function isIdxInMapGenBounds(config, grid, idx) {
    if (config.boundsMode === "rect") {
        const dCol = (idx % grid.cols) - (config.boundsIdx % grid.cols);
        const dRow = ((idx / grid.cols) | 0) - ((config.boundsIdx / grid.cols) | 0);
        return dCol >= 0 && dCol < config.boundsCols && dRow >= 0 && dRow < config.boundsRows;
    }
    const dCol = (idx % grid.cols) - (config.centerIdx % grid.cols);
    const dRow = ((idx / grid.cols) | 0) - ((config.centerIdx / grid.cols) | 0);
    const dist = Math.hypot(dCol, dRow);
    if (config.boundsMode === "circle") return dist <= config.outerRadiusCells;
    const innerR = getInnerRadiusCells(config);
    return dist <= config.outerRadiusCells && dist >= innerR;
}
export function forEachGlobalCellInMapGenBounds(grid, config, fn) {
    const { originIdx, cols, strideCols, cellCount } = stampLayoutFromConfig(grid, config);
    forEachStampGlobalIdx(originIdx, cols, strideCols, cellCount, grid, config, (idx) => fn(idx));
}
export function applyMapGenShapeMask(grid, cells, originIdx, layoutCols, strideCols, cellCount, config) {
    if (config.boundsMode === "rect") return;
    forEachStampLocalIdx(cellCount, (localIdx) => {
        const idx = stampGlobalIdx(originIdx, localIdx, layoutCols, strideCols);
        if (!isIdxInMapGenBounds(config, grid, idx)) cells[localIdx] = 0;
    });
}
export function centerMapGenBoundsOnViewport(grid, viewport, config) {
    const cellSize = grid.cellSize;
    if (config.boundsMode === "rect") {
        const minX = viewport.x - (config.boundsCols * cellSize) / 2;
        const minY = viewport.y - (config.boundsRows * cellSize) / 2;
        ENGINE_F32[ENGINE_BOUNDS_BASE + B_TMP] = minX;
        ENGINE_F32[ENGINE_BOUNDS_BASE + B_TMP + 1] = minY;
        ENGINE_F32[ENGINE_BOUNDS_BASE + B_TMP + 2] = minX + config.boundsCols * cellSize;
        ENGINE_F32[ENGINE_BOUNDS_BASE + B_TMP + 3] = minY + config.boundsRows * cellSize;
        grid.expandToCoverAabbF32(ENGINE_F32, ENGINE_BOUNDS_BASE + B_TMP);
        config.boundsIdx = grid.worldToIdx(minX + cellSize * 0.5, minY + cellSize * 0.5);
        return;
    }
    config.centerIdx = grid.worldToIdx(viewport.x, viewport.y);
}
export function syncMapGenBoundsSizeFromPlayArea(playConfig, config) {
    if (config.boundsMode === "rect") {
        config.boundsCols = playConfig.playAreaCols;
        config.boundsRows = playConfig.playAreaRows;
        return;
    }
    config.outerRadiusCells = Math.max(1, Math.round(Math.min(playConfig.playAreaCols, playConfig.playAreaRows) / 2));
}
export function migrateMapGenBoundsForMode(grid, config) {
    if (config.boundsMode === "rect") {
        const boundsCol = config.boundsIdx % grid.cols;
        const boundsRow = (config.boundsIdx / grid.cols) | 0;
        const centerCol = boundsCol + Math.floor(config.boundsCols / 2);
        const centerRow = boundsRow + Math.floor(config.boundsRows / 2);
        config.centerIdx = grid.worldToIdx(grid.gridCenterX(centerCol), grid.gridCenterY(centerRow));
        config.outerRadiusCells = Math.max(1, Math.round(Math.min(config.boundsCols, config.boundsRows) / 2));
        return;
    }
    const r = Math.max(1, config.outerRadiusCells);
    const centerCol = config.centerIdx % grid.cols;
    const centerRow = (config.centerIdx / grid.cols) | 0;
    config.boundsIdx = grid.worldToIdx(grid.gridCenterX(centerCol - r), grid.gridCenterY(centerRow - r));
    config.boundsCols = r * 2;
    config.boundsRows = r * 2;
    if (config.boundsMode === "donut") config.donutThicknessCells = Math.max(1, Math.min(config.donutThicknessCells, config.outerRadiusCells - 1));
}
function mapGenBoundsCacheMatches(cache, config) {
    return cache.boundsMode === config.boundsMode && cache.boundsIdx === config.boundsIdx && cache.boundsCols === config.boundsCols && cache.boundsRows === config.boundsRows && cache.centerIdx === config.centerIdx && cache.outerRadiusCells === config.outerRadiusCells && cache.donutThicknessCells === config.donutThicknessCells;
}
export function refreshMapGenBoundsAabb(grid, cache, config) {
    if (mapGenBoundsCacheMatches(cache, config)) return;
    cache.boundsMode = config.boundsMode;
    cache.boundsIdx = config.boundsIdx;
    cache.boundsCols = config.boundsCols;
    cache.boundsRows = config.boundsRows;
    cache.centerIdx = config.centerIdx;
    cache.outerRadiusCells = config.outerRadiusCells;
    cache.donutThicknessCells = config.donutThicknessCells;
    getMapGenBoundsAabbF32(grid, cache.aabb, 0, config);
}
export function getMapGenBoundsConfig(editor, kind) {
    if (kind === "erase") return editor.eraseConfig;
    for (let i = 0; i < MAP_GEN_SURFACE_REGION_SPECS.length; i++) {
        const spec = MAP_GEN_SURFACE_REGION_SPECS[i];
        if (spec.kind === kind) return editor[spec.editorKey];
    }
    return editor.eraseConfig;
}
export function getMapGenSurfaceRegionSpec(kind) {
    for (let i = 0; i < MAP_GEN_SURFACE_REGION_SPECS.length; i++) if (MAP_GEN_SURFACE_REGION_SPECS[i].kind === kind) return MAP_GEN_SURFACE_REGION_SPECS[i];
    return null;
}
export function getMapGenBoundsAabbCache(editor, kind) {
    return editor.mapBoundsPreview[kind];
}
export function refreshAllMapGenBoundsPreviews(grid, editor) {
    for (let i = 0; i < MAP_GEN_KINDS.length; i++) {
        const kind = MAP_GEN_KINDS[i];
        refreshMapGenBoundsAabb(grid, getMapGenBoundsAabbCache(editor, kind), getMapGenBoundsConfig(editor, kind));
    }
}
export function syncMapGenBoundsFromPlay(grid, viewport, playConfig, config, { center = true, syncSizeFromPlay = false } = {}) {
    if (syncSizeFromPlay) syncMapGenBoundsSizeFromPlayArea(playConfig, config);
    if (center) centerMapGenBoundsOnViewport(grid, viewport, config);
}
export function registerMapGenBoundsGridExpansionListener(state) {
    const grid = state.obstacleGrid;
    if (grid._mapGenExpansionListenerRegistered) return;
    grid._mapGenExpansionListenerRegistered = true;
    const oldOnBoundsExpansion = grid.onBoundsExpansion;
    grid.onBoundsExpansion = (colOffset, rowOffset, oldCols, oldRows) => {
        if (oldOnBoundsExpansion) oldOnBoundsExpansion(colOffset, rowOffset, oldCols, oldRows);
        for (let i = 0; i < MAP_GEN_KINDS.length; i++) {
            const kind = MAP_GEN_KINDS[i];
            const config = getMapGenBoundsConfig(state.editor, kind);
            if (!config) continue;
            if (config.boundsMode === "rect") {
                const oldCol = config.boundsIdx % oldCols;
                const oldRow = (config.boundsIdx / oldCols) | 0;
                config.boundsIdx = grid.worldToIdx(grid.gridCenterX(oldCol + colOffset), grid.gridCenterY(oldRow + rowOffset));
            } else {
                const oldCol = config.centerIdx % oldCols;
                const oldRow = (config.centerIdx / oldCols) | 0;
                config.centerIdx = grid.worldToIdx(grid.gridCenterX(oldCol + colOffset), grid.gridCenterY(oldRow + rowOffset));
            }
            migrateMapGenBoundsForMode(grid, config);
            remapMapGenStampIdx(config, grid, colOffset, rowOffset, oldCols);
        }
    };
}
function clearStaticWallsAndEdgesAtIdx(grid, idx) {
    let cellChanged = false;
    if (cellIsStaticWallAtIdx(grid, idx)) {
        grid.grid[idx] = 0;
        cellChanged = true;
    }
    if (grid.hasAnyCellEdgeAtIdx(idx)) {
        grid.clearCellEdges(idx);
        cellChanged = true;
    }
    return cellChanged;
}
function clearStaticWallsAndEdgesInBounds(grid, bounds) {
    forEachDenseCellInRect(grid, bounds.startCol, bounds.endCol, bounds.startRow, bounds.endRow, (idx) => {
        clearStaticWallsAndEdgesAtIdx(grid, idx);
    });
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH_WALL);
    return bounds;
}
function stampCellBoundsForConfig(grid, config) {
    const layout = stampLayoutFromConfig(grid, config);
    return cellBoundsFromStampScalars(layout.originIdx, layout.cols, layout.rows, layout.strideCols, layout.cellCount);
}
function clearStaticWallsInWorldCircle(state, centerWorldX, centerWorldY, radiusWorld) {
    const grid = state.obstacleGrid;
    centerReachAabbF32(ENGINE_F32, ENGINE_BOUNDS_BASE + B_TMP, centerWorldX, centerWorldY, radiusWorld);
    const bounds = emptyCellBounds();
    forEachObstacleGridCellInAabbF32(grid, ENGINE_F32, ENGINE_BOUNDS_BASE + B_TMP, (idx) => {
        grid.getCellBoundsByIdxF32(ENGINE_F32, ENGINE_BOUNDS_BASE + B_CELL, idx);
        const o = ENGINE_BOUNDS_BASE + B_CELL;
        const cx = (ENGINE_F32[o] + ENGINE_F32[o + 2]) * 0.5;
        const cy = (ENGINE_F32[o + 1] + ENGINE_F32[o + 3]) * 0.5;
        if (Math.hypot(cx - centerWorldX, cy - centerWorldY) >= radiusWorld) return;
        if (!clearStaticWallsAndEdgesAtIdx(grid, idx)) return;
        growCellBoundsIdx(bounds, idx, grid);
    });
    if (isEmptyCellBounds(bounds)) return null;
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH_WALL);
    return bounds;
}
function eraseWallsInShape(state) {
    const grid = state.obstacleGrid;
    const eraseConfig = state.editor.eraseConfig;
    const bounds = emptyCellBounds();
    forEachGlobalCellInMapGenBounds(grid, eraseConfig, (idx) => {
        if (!clearStaticWallsAndEdgesAtIdx(grid, idx)) return;
        growCellBoundsIdx(bounds, idx, grid);
    });
    if (isEmptyCellBounds(bounds)) return null;
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH_WALL);
    return bounds;
}
function mergeDonutInnerClear(state, config, damageBounds) {
    if (config.boundsMode !== "donut") return damageBounds;
    const grid = state.obstacleGrid;
    const cellSize = grid.cellSize;
    getMapGenBoundsCenterWorldF32(ENGINE_F32, S_OUT_XY, grid, config);
    const cleared = clearStaticWallsInWorldCircle(state, ENGINE_F32[S_OUT_XY], ENGINE_F32[S_OUT_XY + 1], getInnerRadiusCells(config) * cellSize);
    return cleared ? unionCellBounds(damageBounds, cleared) : damageBounds;
}
export function applyMapGenSurfaceProfile(state, config, profileId) {
    const grid = state.obstacleGrid;
    const cellsPerChunk = state.worldSurfaces.settings.cellsPerChunk;
    grid.setChunkSurfaceProfileForCellBounds(stampCellBoundsForConfig(grid, config), profileId, cellsPerChunk);
    grid.surfaceMaterialRevision++;
}
function paintMapGenStampedRegion(state, config, defaultProfile) {
    if (!hasMapGenStamp(config)) return;
    const profileId = config.surfaceProfileId || defaultProfile;
    applyMapGenSurfaceProfile(state, stampedPaintConfig(config), profileId);
}
export function repaintMapGenRegionSurfaceIfStamped(state, kind) {
    const spec = getMapGenSurfaceRegionSpec(kind);
    if (!spec) return;
    paintMapGenStampedRegion(state, state.editor[spec.editorKey], spec.defaultProfile);
    state.worldSurfaces.clearBakeCache();
}
export function refreshAllStampedRegionSurfaces(state) {
    const grid = state.obstacleGrid;
    const cellsPerChunk = state.worldSurfaces.settings.cellsPerChunk;
    grid.surfaceMaterials.chunkProfileIds.clear();
    grid.surfaceMaterialRevision++;
    for (let i = 0; i < MAP_GEN_SURFACE_REGION_SPECS.length; i++) {
        const spec = MAP_GEN_SURFACE_REGION_SPECS[i];
        const config = state.editor[spec.editorKey];
        if (!hasMapGenStamp(config)) continue;
        const profileId = config.surfaceProfileId || spec.defaultProfile;
        grid.setChunkSurfaceProfileForCellBounds(stampCellBoundsForConfig(grid, stampedPaintConfig(config)), profileId, cellsPerChunk);
    }
    grid.surfaceMaterialRevision++;
    state.worldSurfaces.clearBakeCache();
}
async function finalizeMapGenRun(state, { config, profileId, damageBounds, fullNavSync = true, syncFloorSeed = true } = {}) {
    recordMapGenStamp(config);
    if (profileId != null) applyMapGenSurfaceProfile(state, stampedPaintConfig(config), profileId);
    await commitGridNavEdit(state, damageBounds ?? null, { fullNavSync });
    if (syncFloorSeed) state.floorSeed = state.mapSeed;
    state.worldSurfaces.clearBakeCache();
}
function stampCellInBounds(originIdx, cellLocalIdx, cellStride, layoutCols, config, grid) {
    const idx = stampGlobalIdx(originIdx, cellLocalIdx, layoutCols, cellStride);
    if (idx < 0 || idx >= grid.grid.length) return false;
    return isIdxInMapGenBounds(config, grid, idx);
}
function runRailCavernEdgeCA(mapSeed, config, originIdx, layoutCols, strideCols, cellCount, grid, openBoundarySides, axis) {
    const cols = strideCols;
    const rows = cellCount / strideCols;
    const horizontal = axis === "h";
    const edgeStride = horizontal ? cols : cols + 1;
    const edgeCount = horizontal ? cols * (rows + 1) : (cols + 1) * rows;
    const seedOffset = horizontal ? 0 : 1;
    let cells = null;
    withSeededRandom(mapSeed + seedOffset, () => {
        cells = fillRandomGrid(edgeStride, edgeCount / edgeStride, config.fillChance);
        cells = runCellularAutomata(edgeStride, edgeCount / edgeStride, cells, { iterations: config.iterations, scratch: new Uint8Array(edgeCount) });
    });
    for (let edgeIdx = 0; edgeIdx < edgeCount; edgeIdx++) {
        let in1 = false;
        let in2 = false;
        if (horizontal) {
            in1 = edgeIdx >= edgeStride && stampCellInBounds(originIdx, edgeIdx - edgeStride, cols, layoutCols, config, grid);
            in2 = stampCellInBounds(originIdx, edgeIdx, cols, layoutCols, config, grid);
        } else {
            const lc = edgeIdx % edgeStride;
            const lr = (edgeIdx / edgeStride) | 0;
            in1 = lc > 0 && stampCellInBounds(originIdx, lr * cols + lc - 1, cols, layoutCols, config, grid);
            in2 = lc < cols && stampCellInBounds(originIdx, lr * cols + lc, cols, layoutCols, config, grid);
        }
        if (!in1 && !in2) cells[edgeIdx] = 0;
    }
    if (horizontal) {
        if (openBoundarySides?.north) for (let edgeIdx = 0; edgeIdx < edgeStride; edgeIdx++) cells[edgeIdx] = 0;
        if (openBoundarySides?.south) {
            const southStart = rows * edgeStride;
            for (let edgeIdx = southStart; edgeIdx < southStart + edgeStride; edgeIdx++) cells[edgeIdx] = 0;
        }
    } else {
        if (openBoundarySides?.west) for (let edgeIdx = 0; edgeIdx < edgeCount; edgeIdx += edgeStride) cells[edgeIdx] = 0;
        if (openBoundarySides?.east) for (let edgeIdx = edgeStride - 1; edgeIdx < edgeCount; edgeIdx += edgeStride) cells[edgeIdx] = 0;
    }
    return { cells, edgeStride, edgeCount };
}
function stampRailCavernEdgesFromCA(grid, config, mapSeed, { openBoundarySides, heightLevel, thicknessLevel }) {
    const { originIdx, cols: layoutCols, strideCols, cellCount } = stampLayoutFromConfig(grid, config);
    const cols = strideCols;
    const rows = cellCount / strideCols;
    const h = runRailCavernEdgeCA(mapSeed, config, originIdx, layoutCols, strideCols, cellCount, grid, openBoundarySides, "h");
    const v = runRailCavernEdgeCA(mapSeed, config, originIdx, layoutCols, strideCols, cellCount, grid, openBoundarySides, "v");
    const bounds = stampCellBoundsForConfig(grid, config);
    clearStaticWallsAndEdgesInBounds(grid, bounds);
    for (let edgeIdx = 0; edgeIdx < h.edgeCount; edgeIdx++) {
        if (h.cells[edgeIdx] !== 1) continue;
        const lr = (edgeIdx / h.edgeStride) | 0;
        const lc = edgeIdx - lr * h.edgeStride;
        const cellLocalBelow = lr * cols + lc;
        const idxBelow = stampGlobalIdx(originIdx, cellLocalBelow, layoutCols, cols);
        if (lr < rows && idxBelow >= 0 && idxBelow < grid.grid.length) setBoundary(grid, idxBelow, 0, heightLevel, thicknessLevel);
        else if (lr > 0) {
            const idxAbove = stampGlobalIdx(originIdx, (lr - 1) * cols + lc, layoutCols, cols);
            if (idxAbove >= 0 && idxAbove < grid.grid.length) setBoundary(grid, idxAbove, 2, heightLevel, thicknessLevel);
        }
    }
    for (let edgeIdx = 0; edgeIdx < v.edgeCount; edgeIdx++) {
        if (v.cells[edgeIdx] !== 1) continue;
        const lr = (edgeIdx / v.edgeStride) | 0;
        const lc = edgeIdx % v.edgeStride;
        const idxRight = stampGlobalIdx(originIdx, lr * cols + lc, layoutCols, cols);
        if (lc < cols && idxRight >= 0 && idxRight < grid.grid.length) setBoundary(grid, idxRight, 3, heightLevel, thicknessLevel);
        else if (lc > 0) {
            const idxLeft = stampGlobalIdx(originIdx, lr * cols + lc - 1, layoutCols, cols);
            if (idxLeft >= 0 && idxLeft < grid.grid.length) setBoundary(grid, idxLeft, 1, heightLevel, thicknessLevel);
        }
    }
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH_WALL);
    return bounds;
}
function createMapGenRun(state) {
    const grid = state.obstacleGrid;
    return {
        ensureCoverage() {
            return ensureLabObstacleGridCoverage(state);
        },
        stampCellBounds(config) {
            return stampCellBoundsForConfig(grid, config);
        },
        clearStamp(config) {
            return clearStaticWallsAndEdgesInBounds(grid, stampCellBoundsForConfig(grid, config));
        },
        mergeDonut(config, bounds) {
            return mergeDonutInnerClear(state, config, bounds);
        },
        async finish(config, profileId, damageBounds, opts = {}) {
            await finalizeMapGenRun(state, { config, profileId, damageBounds, fullNavSync: opts.fullNavSync ?? true });
        },
    };
}
export async function initTileLabWorld(state) {
    await applyPlayAreaConfig(state);
}
export async function applyPlayAreaConfig(state) {
    registerMapGenBoundsGridExpansionListener(state);
    const { viewport, editor } = state;
    const { playConfig } = editor;
    const grid = state.obstacleGrid;
    for (let i = 0; i < MAP_GEN_KINDS.length; i++) {
        const kind = MAP_GEN_KINDS[i];
        const config = getMapGenBoundsConfig(editor, kind);
        syncMapGenBoundsFromPlay(grid, viewport, playConfig, config, { center: true, syncSizeFromPlay: true });
        migrateMapGenBoundsForMode(state.obstacleGrid, config);
        clearMapGenStamp(config);
    }
    ensureLabObstacleGridCoverage(state);
    refreshAllStampedRegionSurfaces(state);
    await commitGridNavEdit(state, null, { fullNavSync: true });
}
export function ensureLabObstacleGridCoverage(state) {
    const grid = state.obstacleGrid;
    const cellSize = grid.cellSize;
    const { editor } = state;
    const acc = ENGINE_BOUNDS_BASE + B_TMP;
    const scratch = ENGINE_BOUNDS_BASE + B_FOOTPRINT;
    const padded = ENGINE_BOUNDS_BASE + B_PAD;
    getMapGenBoundsAabbF32(grid, ENGINE_F32, acc, editor.cavernConfig);
    getMapGenBoundsAabbF32(grid, ENGINE_F32, scratch, editor.railConfig);
    unionAabbF32(ENGINE_F32, acc, ENGINE_F32, acc, ENGINE_F32, scratch);
    getMapGenBoundsAabbF32(grid, ENGINE_F32, scratch, editor.railMazeConfig);
    unionAabbF32(ENGINE_F32, acc, ENGINE_F32, acc, ENGINE_F32, scratch);
    getMapGenBoundsAabbF32(grid, ENGINE_F32, scratch, editor.eraseConfig);
    unionAabbF32(ENGINE_F32, acc, ENGINE_F32, acc, ENGINE_F32, scratch);
    padAabbF32(ENGINE_F32, padded, ENGINE_F32, acc, cellSize);
    return grid.expandToCoverAabbF32(ENGINE_F32, padded);
}
export async function eraseLabWallsInBounds(state) {
    ensureLabObstacleGridCoverage(state);
    const damageBounds = eraseWallsInShape(state);
    if (!damageBounds) return;
    await finalizeMapGenRun(state, { damageBounds, fullNavSync: false, syncFloorSeed: false });
}
export async function generateLabCaverns(state, { openBoundarySides = null, openBoundaryRows = 1 } = {}) {
    const { cavernConfig } = state.editor;
    const grid = state.obstacleGrid;
    const run = createMapGenRun(state);
    let stamp = null;
    withSeededRandom(state.mapSeed, () => {
        stamp = generateCavernOccupancy(grid, cavernConfig, { openBoundarySides, openBoundaryRows });
    });
    run.ensureCoverage();
    const level = clampStampWallHeightLevel(cavernConfig.wallHeightLevel, state.worldSurfaces.settings);
    let damageBounds = grid.stampStaticWalls(stamp.originIdx, stamp.cols, stamp.rows, stamp.strideCols, stamp.cellCount, stamp.cells, { additive: true, heightLevel: level });
    damageBounds = run.mergeDonut(cavernConfig, damageBounds);
    await run.finish(cavernConfig, cavernConfig.surfaceProfileId || "tomatoGarden", damageBounds, { fullNavSync: true });
}
export async function generateLabRailCaverns(state, { openBoundarySides = null } = {}) {
    const { railConfig } = state.editor;
    const grid = state.obstacleGrid;
    const run = createMapGenRun(state);
    run.ensureCoverage();
    const level = clampStampWallHeightLevel(railConfig.wallHeightLevel, state.worldSurfaces.settings);
    let damageBounds = stampRailCavernEdgesFromCA(grid, railConfig, state.mapSeed, { openBoundarySides, heightLevel: level, thicknessLevel: railConfig.edgeThickness });
    damageBounds = run.mergeDonut(railConfig, damageBounds);
    await run.finish(railConfig, railConfig.surfaceProfileId || "poolTableFelt", damageBounds, { fullNavSync: true });
}
function stampRailMazeBeltsPhase(state, config, options = {}) {
    const grid = state.obstacleGrid;
    const centerIdx = getMapGenBoundsCenterIdx(grid, config);
    const floodSeedBounds = options.floodSeedBounds ?? { boundsMode: "rect", boundsIdx: centerIdx, boundsCols: 1, boundsRows: 1 };
    const navWalkableIndex = options.navWalkableIndex ?? getNavWalkableCellIndex(state, config, floodSeedBounds);
    const session = new CorridorBeltSession(grid, state.nav.topology, config, navWalkableIndex);
    const { beltPlan, beltRails } = session.plan({ mapSeed: state.mapSeed });
    beltPlan.stamp(state);
    stampGlobalRailWalls(state, beltRails, { commit: false });
}
export async function generateLabRailMaze(state, options = {}) {
    registerMapGenBoundsGridExpansionListener(state);
    const config = options.boundsConfig ?? state.editor.railMazeConfig;
    const grid = state.obstacleGrid;
    const run = createMapGenRun(state);
    run.ensureCoverage();
    const { originIdx, cols: layoutCols, strideCols, cellCount } = stampLayoutFromConfig(grid, config);
    const bounds = run.clearStamp(config);
    const railWallHeightLevel = options.railWallHeightLevel ?? config.wallHeightLevel;
    const railWallThicknessLevel = options.railWallThicknessLevel ?? config.edgeThickness;
    const corridorWidthMin = options.corridorWidthMin ?? config.corridorWidthMin;
    const corridorWidthMax = options.corridorWidthMax ?? config.corridorWidthMax;
    const extraLinkRatio = options.extraLinkRatio ?? config.extraLinkRatio;
    let rails = bakeRailMazeDfs(originIdx, layoutCols, strideCols, cellCount, { railWallHeightLevel, railWallThicknessLevel, corridorWidthMin, corridorWidthMax, extraLinkRatio }, state.mapSeed);
    if (config.boundsMode !== "rect")
        rails.compactInPlace((idx, side) => {
            const inCell = isIdxInMapGenBounds(config, grid, idx);
            const nIdx = edgeNeighborIdx(idx, side, grid);
            const inNeighbor = nIdx >= 0 && isIdxInMapGenBounds(config, grid, nIdx);
            return inCell || inNeighbor;
        });
    stampGlobalRailWalls(state, rails, { commit: false });
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH_WALL);
    let damageBounds = run.mergeDonut(config, bounds);
    await commitGridNavEdit(state, damageBounds);
    stampRailMazeBeltsPhase(state, config, options);
    await run.finish(config, config.surfaceProfileId, null, { fullNavSync: true });
}
export class KineticSpatialFrame extends SpatialFrameCore {
    constructor(cellSize = 50) {
        super(cellSize);
        this.kineticEids = new Int32Array(64);
        this.kineticEidCount = 0;
        this.populatedMembershipGen = 0;
        this._activationScheduled = new Set();
        this._patchPrimarySeen = new Uint8Array(MAX_ENTITIES);
        this._patchPrimarySeenIds = new Int32Array(MAX_ENTITIES);
    }
    _ensureKineticEidCap(n) {
        if (this.kineticEids.length >= n) return;
        const next = new Int32Array(Math.max(n, this.kineticEids.length * 2));
        next.set(this.kineticEids.subarray(0, this.kineticEidCount));
        this.kineticEids = next;
    }
    _pushKineticEid(eid) {
        this._ensureKineticEidCap(this.kineticEidCount + 1);
        this.kineticEids[this.kineticEidCount++] = eid;
    }
    releasePhysId(physId, prop, session) {
        invalidateKineticSlabSlot(physId);
        this.entityGrid.entityNext[physId] = -1;
        entityGridTileIdx[physId] = -1;
        if (prop) delete prop._physId;
        releaseEntityEid(physId);
        bumpKineticTopologyGeneration(session);
    }
    repopulateFrameMembership(state) {
        this.kineticEidCount = 0;
        state.entityRegistry.forEachOfKind("worldProp", (prop) => {
            const needBind = prop._physId === undefined || !entityAlive[prop._physId] || entityRefs[prop._physId] !== prop;
            let physId = prop._physId;
            if (physId === undefined) physId = allocateEntityEid();
            if (needBind) {
                invalidateKineticShapeGeom(physId);
                prop._physId = physId;
                normalizeKineticBody(prop);
                const x = prop.x;
                const y = prop.y;
                const flags = worldPropBindFlags(prop);
                bindEntitySlot(physId, ENTITY_KIND_WORLD_PROP, prop, prop.id | 0, x, y, slabCollisionSpan(physId), flags);
                clearWorldPropSpawnPose(prop);
            } else {
                prop._physId = physId;
                if (kineticDynamicSlab.partGeomOffset[physId] < 0) normalizeKineticBody(prop);
            }
            this.insertEid(physId);
            if ((entityFlags[physId] & ENTITY_FLAG_KINETIC) !== 0) this._pushKineticEid(physId);
        });
        const debrisBodies = state.fractureEngine.debris.list();
        for (let i = 0; i < debrisBodies.length; i++) {
            const body = debrisBodies[i];
            if (body.isDead) continue;
            const needBind = body._physId === undefined || !entityAlive[body._physId] || entityRefs[body._physId] !== body;
            let physId = body._physId;
            if (physId === undefined) physId = allocateEntityEid();
            if (needBind) {
                invalidateKineticShapeGeom(physId);
                body._physId = physId;
                normalizeKineticBody(body);
                const x = body.x;
                const y = body.y;
                const flags = worldPropBindFlags(body);
                bindEntitySlot(physId, ENTITY_KIND_DEBRIS, body, body.id | 0, x, y, slabCollisionSpan(physId), flags);
                clearWorldPropSpawnPose(body);
            } else {
                body._physId = physId;
                if (kineticDynamicSlab.partGeomOffset[physId] < 0) normalizeKineticBody(body);
            }
            this.insertEid(physId);
            if ((entityFlags[physId] & ENTITY_FLAG_KINETIC) !== 0) this._pushKineticEid(physId);
        }
        this.populatedMembershipGen = state.entityRegistry.membershipGen;
    }
    begin(state) {
        this.resetFrame(state.obstacleGrid);
        this.repopulateFrameMembership(state);
        this.syncActiveKineticBodies();
        refreshActiveKineticBodySlabPose();
        return this;
    }
    admitKineticProps(props, world) {
        let anyAdmitted = false;
        for (let i = 0; i < props.length; i++) {
            const prop = props[i];
            let physId = prop._physId;
            const isNew = physId === undefined || entityAlive[physId] === 0;
            if (isNew) {
                const x = prop.x;
                const y = prop.y;
                const flags = worldPropBindFlags(prop);
                if (physId === undefined) {
                    physId = allocateEntityEid();
                    prop._physId = physId;
                }
                normalizeKineticBody(prop);
                const kind = prop.isKineticDebris ? ENTITY_KIND_DEBRIS : ENTITY_KIND_WORLD_PROP;
                bindEntitySlot(physId, kind, prop, prop.id | 0, x, y, slabCollisionSpan(physId), flags);
                clearWorldPropSpawnPose(prop);
                if ((entityFlags[physId] & ENTITY_FLAG_KINETIC) !== 0) this._pushKineticEid(physId);
            } else this.entityGrid.remove(physId);
            if (kineticDynamicSlab.partGeomOffset[prop._physId] < 0) normalizeKineticBody(prop);
            this.entityGrid.insert(prop._physId);
            if ((entityFlags[prop._physId] & ENTITY_FLAG_KINETIC) !== 0) this.activateKineticBody(prop._physId);
            anyAdmitted = true;
        }
        if (anyAdmitted) {
            this.frameId = (this.frameId + 1) | 0;
            this.populatedMembershipGen = world.entityRegistry.membershipGen;
            bumpKineticTopologyGeneration(world.kinetic);
        }
    }
    syncActiveKineticBodies() {
        clearActiveKineticBodySlab();
        const all = this.kineticEids;
        const n = this.kineticEidCount;
        const sleeping = kineticDynamicSlab.sleeping;
        for (let i = 0; i < n; i++) {
            const eid = all[i];
            if (!entityAlive[eid] || (entityFlags[eid] & ENTITY_FLAG_KINETIC) === 0) continue;
            if (!sleeping[eid]) appendActiveKineticBodySlabPhysId(eid);
        }
    }
    _ensureActive(eid) {
        if (!entityAlive[eid] || (entityFlags[eid] & ENTITY_FLAG_KINETIC) === 0) return;
        if (kineticDynamicSlab.activeSlot[eid] >= 0) return;
        appendActiveKineticBodySlabPhysId(eid);
    }
    _removeFromActive(eid) {
        const slab = kineticDynamicSlab;
        const slot = slab.activeSlot[eid];
        if (slot == null || slot < 0) return;
        const lastIdx = slab.activePhysCount - 1;
        const last = slab.activePhysIds[lastIdx];
        slab.activePhysCount = lastIdx;
        if (slot < lastIdx) {
            slab.activePhysIds[slot] = last;
            slab.activeSlot[last] = slot;
        }
        slab.activeSlot[eid] = -1;
    }
    scheduleKineticActivation(eid) {
        wakeKineticBody(eid);
        this._activationScheduled.add(eid);
    }
    _wakeConstraintLinkedPeers(eid, patchOut) {
        const count = kineticDynamicSlab.linkNeighborCount[eid];
        if (count === 0) return;
        const offset = kineticDynamicSlab.linkNeighborOffset[eid];
        const peerEids = kineticDynamicSlab.linkNeighborEids;
        for (let i = 0; i < count; i++) {
            const peerEid = peerEids[offset + i];
            if (peerEid === eid) continue;
            if (!entityAlive[peerEid] || (entityFlags[peerEid] & ENTITY_FLAG_KINETIC) === 0) continue;
            if (kineticDynamicSlab.sleeping[peerEid]) wakeKineticBody(peerEid);
            this._ensureActive(peerEid);
            if (patchOut) patchOut.push(peerEid);
        }
    }
    flushScheduledKineticActivations(patchOut) {
        const scheduled = this._activationScheduled;
        if (scheduled.size === 0) return;
        for (const eid of scheduled) {
            this._ensureActive(eid);
            this._wakeConstraintLinkedPeers(eid, patchOut);
            if (patchOut) patchOut.push(eid);
        }
        scheduled.clear();
    }
    activateKineticBody(eid) {
        if (kineticDynamicSlab.sleeping[eid]) wakeKineticBody(eid);
        this._ensureActive(eid);
        this._wakeConstraintLinkedPeers(eid);
    }
    reindexActiveKineticBodies() {
        const slab = kineticDynamicSlab;
        if (!slab.activePhysCount) return;
        for (let i = 0; i < slab.activePhysCount; i++) {
            const eid = slab.activePhysIds[i];
            if (!entityAlive[eid]) continue;
            this.entityGrid.remove(eid);
            this.entityGrid.insert(eid);
        }
        this.frameId = (this.frameId + 1) | 0;
        invalidateWallCandidateBucketFrame(this._wallBuckets);
    }
    reindexKineticBodies(eids, count = eids.length) {
        if (!count) return;
        for (let i = 0; i < count; i++) {
            const eid = eids[i];
            if (!entityAlive[eid]) continue;
            this.entityGrid.remove(eid);
            this.entityGrid.insert(eid);
        }
        this.frameId = (this.frameId + 1) | 0;
        invalidateWallCandidateBucketFrame(this._wallBuckets);
    }
    evictKineticProp(prop, session) {
        const physId = prop._physId;
        const x = kineticDynamicSlab.x[physId];
        const y = kineticDynamicSlab.y[physId];
        const vx = kineticDynamicSlab.vx[physId];
        const vy = kineticDynamicSlab.vy[physId];
        const w = kineticDynamicSlab.w[physId];
        prop._spawnX = x;
        prop._spawnY = y;
        prop._spawnVx = vx;
        prop._spawnVy = vy;
        prop._spawnW = w;
        this.entityGrid.remove(physId);
        const all = this.kineticEids;
        for (let i = this.kineticEidCount - 1; i >= 0; i--)
            if (all[i] === physId) {
                all[i] = all[--this.kineticEidCount];
                break;
            }
        this._removeFromActive(physId);
        this._activationScheduled.delete(physId);
        this.releasePhysId(physId, prop, session);
        this.frameId = (this.frameId + 1) | 0;
    }
}
/** Shared frame for simulation ticks. Call begin() once per update. */
export const kineticSpatial = new KineticSpatialFrame(50);
