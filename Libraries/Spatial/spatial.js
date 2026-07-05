import { withSeededRandom } from "../Random/index.js";
import { invalidateGridLocalNavBake, createNavGraphViewFromTopology, CorridorPathfinder, getNavWalkableCellIndex } from "../Navigation/navigation.js";
import {
    CARDINAL_DCOL,
    CARDINAL_DR,
    centerReachAabbInto,
    createAabb,
    minCornerAabbInto,
    minCornerAabb,
    angleDelta,
    radiusAtT,
    scaleAtHeight,
    closestPointOnLineSegment,
    CARDINAL_FACING_STEPS,
    centeredAabbInto,
    padAabbInto,
    lengthXY,
    centerHalfExtentsAabbInto,
    boxLocalFootprint,
    convexFootprintHalfExtents,
    vertCount,
    stepCardinalFacing,
    createSeededRng,
    padAabb,
    unionAabb,
} from "../Math/math.js";
import {
    entityBroadphaseExtent,
    neighborQueryPadFor,
    maxNeighborQueryPad,
    circleLeadingPoint,
    minDistanceSegmentToWall,
    circleIntersectsSegment,
    CircleShape,
    PolygonShape,
    satCheckCollision,
    entityFacing,
    wakeKineticBody,
    bumpKineticTopologyGeneration,
    getBroadphaseBounds,
    appendActiveKineticBodySlabPhysId,
    clearActiveKineticBodySlab,
    kineticDynamicSlab,
    writeActiveKineticBodySlabPose,
    writeBroadphaseFromBounds,
    writeStaticKineticSlabSlot,
} from "../Physics/physics.js";
import { SparseBucketGrid } from "../DataStructures/SparseBucketGrid.js";
import { MAX_ENTITIES } from "../../Core/engineLimits.js";
import { clampStampWallHeightLevel } from "../WorldSurface/worldSurface.js";
import { overlaySegment, rebuildLabMapCaches } from "../Render/render.js";
import { resolveNavRuntime } from "../Navigation/navigation.js";
export const FLOOR_CELL_KIND = { None: 0, Belt: 1, BeltElbowLeft: 2, BeltElbowRight: 3 };
export const DEFAULT_FLOOR_BELT_FORCE = 500;
export function gridSideFromCellIdxToNeighborIdx(idx, nIdx, cols) {
    const diff = nIdx - idx;
    if (diff === 1) return 1;
    if (diff === -1) return 3;
    if (diff === cols) return 2;
    if (diff === -cols) return 0;
    return -1;
}
export function railWallEdgeFromStamp(capHeightLevel, thicknessLevel, neighborFillLevel) {
    return createRailWallEdge(capHeightLevel - neighborFillLevel, thicknessLevel);
}
export function gridSideFromCellToNeighbor(c, r, nc, nr) {
    const dc = nc - c;
    const dr = nr - r;
    if (dc === 0 && dr === -1) return 0;
    if (dc === 1 && dr === 0) return 1;
    if (dc === 0 && dr === 1) return 2;
    if (dc === -1 && dr === 0) return 3;
    throw new Error(`gridSideFromCellToNeighbor: non-cardinal step ${dc},${dr}`);
}
/** @typedef {import("../../Math/Aabb2D.js").Aabb2D} Aabb2D */
/** @typedef {import("../../Math/Aabb2D.js").Aabb2D} Aabb2D */
const NEAR_QUERY_BOUNDS = createAabb();
const EMPTY_WALL_CANDIDATES = [];
/**
 * Duck-typed per-tick spatial frame: entity grid, neighbor cache, wall segment cache.
 * Game adapters call resetFrame / insertEntity then run pair policies.
 */
export class SpatialFrameCore {
    constructor(cellSize = 50) {
        this.entityGrid = new EntityGrid(cellSize);
        this.wallQuery = new SpatialQuery();
        this.frameId = 0;
        this._wallBuckets = createWallCandidateBucketSlab();
        this._wallBucketRevision = -1;
        this._obstacleGrid = null;
    }
    /** @param {(import("../Math/Aabb2D.js").Aabb2D & { cols: number, cellSize: number, resetStaticWallProxyPool?: () => void, wallGridRevision?: number }) | null} obstacleGrid */
    resetFrame(obstacleGrid) {
        this.frameId = (this.frameId + 1) | 0;
        invalidateWallCandidateBucketFrame(this._wallBuckets);
        this._obstacleGrid = obstacleGrid?.appendStaticWallProxiesNearWorld ? obstacleGrid : null;
        if (obstacleGrid?.resetStaticWallProxyPool) obstacleGrid.resetStaticWallProxyPool();
        this.entityGrid.syncBounds(obstacleGrid);
        this.entityGrid.clear();
    }
    _ensureWallBucketCacheRevision(grid) {
        const revision = grid.wallGridRevision;
        if (this._wallBucketRevision === revision) return;
        resetWallCandidateBucketSlab(this._wallBuckets);
        grid.resetStaticWallProxyPool();
        this._wallBucketRevision = revision;
    }
    _wallCandidatesNearWorld(worldX, worldY, queryRadius) {
        const grid = this._obstacleGrid;
        this._ensureWallBucketCacheRevision(grid);
        const { keyLo, keyHi } = wallBucketKeyParts(grid, worldX, worldY, queryRadius);
        const revision = grid.wallGridRevision;
        const lookup = lookupWallCandidateBucket(this._wallBuckets, keyLo, keyHi, this.frameId, revision);
        if (lookup.hit) return lookup.segments;
        grid.appendStaticWallProxiesNearWorld(worldX, worldY, queryRadius, lookup.segments);
        commitWallCandidateBucket(this._wallBuckets, lookup.slot, keyLo, keyHi, this.frameId, revision, lookup.segments);
        return lookup.segments;
    }
    /**
     * @param {{ x: number, y: number, _physId?: number, _gridTileIdx?: number }} entity — mutated
     * @param {number} physId
     */
    insertEntity(entity, physId) {
        entity._physId = physId;
        this.entityGrid.insert(entity);
    }
    /**
     * Re-insert bodies after mid-tick motion (physics substep).
     * Bumps frameId so neighbor queries see new poses; wall buckets restamp on next gather.
     *
     * @param {object[]} bodies
     */
    reindexKineticBodies(bodies) {
        if (!bodies?.length) return;
        for (let i = 0; i < bodies.length; i++) {
            const entity = bodies[i];
            this.entityGrid.remove(entity);
            this.entityGrid.insert(entity);
            entity._neighborsFrameId = -1;
        }
        this.frameId = (this.frameId + 1) | 0;
        invalidateWallCandidateBucketFrame(this._wallBuckets);
    }
    getWallCandidates(entity) {
        if (!this._obstacleGrid) return EMPTY_WALL_CANDIDATES;
        return this._wallCandidatesNearWorld(entity.x, entity.y, entityBroadphaseExtent(entity));
    }
    getNeighbors(entity) {
        if (entity._neighborsFrameId === this.frameId) return entity._neighbors;
        if (!entity._neighbors) entity._neighbors = [];
        this.entityGrid.collectNearbyInto(entity, entity._neighbors);
        entity._neighborsFrameId = this.frameId;
        return entity._neighbors;
    }
    forEachNeighbor(entity, fn) {
        const neighbors = this.getNeighbors(entity);
        for (let i = 0; i < neighbors.length; i++) fn(neighbors[i]);
    }
    /**
     * @param {object[]} group
     * @param {(primary: object, neighbor: object) => boolean} shouldPair
     */
    forEachGroupNeighborPair(group, shouldPair, fn) {
        for (let i = 0; i < group.length; i++) {
            const primary = group[i];
            const neighbors = this.getNeighbors(primary);
            for (let j = 0; j < neighbors.length; j++) {
                const neighbor = neighbors[j];
                if (!shouldPair(primary, neighbor)) continue;
                fn(primary, neighbor);
            }
        }
    }
    /**
     * Entities in grid cells overlapping a world AABB. Bounds are expanded by the largest
     * inserted body extent so center-indexed bodies on the edge are not missed.
     *
     * @param {Aabb2D} bounds
     * @param {object | null} [exclude]
     * @returns {object[]}
     */
    collectEntitiesInBounds(bounds, exclude = null) {
        return this.entityGrid.collectInBounds(bounds, this.wallQuery, exclude);
    }
    /**
     * Broadphase around a query anchor (e.g. zone centroid + shape). Does not require insertion.
     *
     * @param {{ x: number, y: number, shape?: import("../collision/Shapes.js").Shape }} anchor
     * @param {object | null} [exclude]
     * @returns {object[]}
     */
    collectEntitiesNear(anchor, exclude = null) {
        const searchRadius = entityBroadphaseExtent(anchor) + this.entityGrid.maxInsertedExtent + neighborQueryPadFor(anchor);
        centerReachAabbInto(NEAR_QUERY_BOUNDS, anchor.x, anchor.y, searchRadius);
        return this.entityGrid.collectInBounds(NEAR_QUERY_BOUNDS, this.wallQuery, exclude, { expandForEntityExtents: false });
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
export function cellEdgeEndpointsIdx(grid, idx, side, p1, p2, inset = 0) {
    const cols = grid.cols;
    const minX = grid.minX + (idx % cols) * grid.cellSize;
    const minY = grid.minY + ((idx / cols) | 0) * grid.cellSize;
    const maxX = minX + grid.cellSize;
    const maxY = minY + grid.cellSize;
    if (side === 0) {
        p1.x = minX;
        p1.y = minY + inset;
        p2.x = maxX;
        p2.y = minY + inset;
    } else if (side === 1) {
        p1.x = maxX - inset;
        p1.y = minY;
        p2.x = maxX - inset;
        p2.y = maxY;
    } else if (side === 2) {
        p1.x = minX;
        p1.y = maxY - inset;
        p2.x = maxX;
        p2.y = maxY - inset;
    } else {
        p1.x = minX + inset;
        p1.y = minY;
        p2.x = minX + inset;
        p2.y = maxY;
    }
    return p1;
}
function edgeRailEmitOwner(grid, idx, side) {
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
const sExposedEdgeP1 = { x: 0, y: 0 };
const sExposedEdgeP2 = { x: 0, y: 0 };
function pushExposedWallEdgesForCell(grid, idx, out) {
    const cols = grid.cols;
    const rows = grid.rows;
    const level = grid.grid[idx];
    if (level === 0) return;
    const wallTopZ = resolveCellWallHeightAtIdx(grid, idx);
    for (let side = 0; side < 4; side++) {
        const nIdx = edgeNeighborIdx(idx, side, grid);
        let neighborLevel = 0;
        if (nIdx !== -1) neighborLevel = grid.grid[nIdx];
        if (neighborLevel >= level) continue;
        if (railWallEdgeAt(grid, idx, side)) continue;
        cellEdgeEndpointsIdx(grid, idx, side, sExposedEdgeP1, sExposedEdgeP2, 0);
        out.add(sExposedEdgeP1.x, sExposedEdgeP1.y, sExposedEdgeP2.x, sExposedEdgeP2.y, GRID_SIDE_NX[side], GRID_SIDE_NY[side], wallTopZ);
    }
}
/** Perimeter edges where a filled wall cell meets lower or empty neighbor. */
export function collectExposedWallEdges(grid, out) {
    out.clear();
    const cellCount = grid.cols * grid.rows;
    for (let idx = 0; idx < cellCount; idx++) pushExposedWallEdgesForCell(grid, idx, out);
}
/** Same as collectExposedWallEdges but only visits wall cells overlapping the world AABB. */
export function collectExposedWallEdgesInAabb(grid, bounds, out) {
    out.clear();
    forEachObstacleGridCellInAabb(grid, bounds, (idx) => {
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
function chunkKeyAxis0(key) {
    return unzigzagChunk(Math.floor(key / CHUNK_KEY_STRIDE));
}
function chunkKeyAxis1(key) {
    return unzigzagChunk(key % CHUNK_KEY_STRIDE);
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
export function cellBoundsFromStampLayout(layout) {
    return cellBoundsFromStampScalars(layout.originIdx, layout.cols, layout.rows, layout.strideCols, layout.cellCount);
}
export function wrapChunkKey(chunkKey, period) {
    return packChunkKey(((chunkKeyAxis0(chunkKey) % period) + period) % period, ((chunkKeyAxis1(chunkKey) % period) + period) % period);
}
export function chunkKeyBoundsInto(out, gridMinX, gridMinY, chunkKey, chunkSizePx) {
    return minCornerAabbInto(out, gridMinX + chunkKeyAxis0(chunkKey) * chunkSizePx, gridMinY + chunkKeyAxis1(chunkKey) * chunkSizePx, chunkSizePx, chunkSizePx);
}
export function worldToChunkKey(worldX, worldY, gridMinX, gridMinY, chunkSizePx) {
    return packChunkKey(Math.floor((worldX - gridMinX) / chunkSizePx), Math.floor((worldY - gridMinY) / chunkSizePx));
}
export function remapChunkCoord(chunkCoord, cellOffset, cellsPerChunk) {
    return cellToChunkCoord(chunkCoord * cellsPerChunk + cellOffset, cellsPerChunk);
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
export function getCellBoundsInCenteredFrameInto(out, frame, idx) {
    const col = idxCol(idx, frame.cols);
    const row = idxRow(idx, frame.cols);
    const minX = col * frame.cellSize + frame.centerX - frame.offsetX;
    const minY = row * frame.cellSize + frame.centerY - frame.offsetY;
    return minCornerAabbInto(out, minX, minY, frame.cellSize, frame.cellSize);
}
/** @param {import("../../Math/Aabb2D.js").Aabb2D} out */
function cellBoundsAtOriginIdxInto(out, grid, idx) {
    const cols = grid.cols;
    const col = idxCol(idx, cols);
    const row = idxRow(idx, cols);
    return minCornerAabbInto(out, grid.minX + col * grid.cellSize, grid.minY + row * grid.cellSize, grid.cellSize, grid.cellSize);
}
/** @param {import("../../Math/Aabb2D.js").Aabb2D} out */
export function cellBoundsToWorldBoundsInto(out, bounds, grid) {
    const cellSize = grid.cellSize;
    out.minX = grid.minX + bounds.startCol * cellSize;
    out.minY = grid.minY + bounds.startRow * cellSize;
    out.maxX = grid.minX + (bounds.endCol + 1) * cellSize;
    out.maxY = grid.minY + (bounds.endRow + 1) * cellSize;
    return out;
}
export function cellBoundsToWorldBounds(bounds, grid) {
    return cellBoundsToWorldBoundsInto(createAabb(), bounds, grid);
}
/**
 * Visit each obstacle-grid cell overlapping a world AABB.
 * @param {{ minX: number, minY: number, cols: number, rows: number, cellSize: number }} grid
 * @param {import("../../Math/Aabb2D.js").Aabb2D} aabb
 * @param {(idx: number) => void} fn
 */
export function forEachObstacleGridCellInAabb(grid, aabb, fn) {
    const rect = boundsToCellRect(aabb.minX - grid.minX, aabb.minY - grid.minY, aabb.maxX - grid.minX - 1e-6, aabb.maxY - grid.minY - 1e-6, grid.cellSize);
    const cols = grid.cols;
    const rows = grid.rows;
    const startCol = Math.max(0, rect.minCol);
    const endCol = Math.min(cols - 1, rect.maxCol);
    const startRow = Math.max(0, rect.minRow);
    const endRow = Math.min(rows - 1, rect.maxRow);
    forEachCellInColRowBounds(startCol, endCol, startRow, endRow, cols, (c, r, idx) => fn(idx));
}
// Viewer-relative radial elevation projection (worldRenderMode: "radial").
// Elevated points lean away from live viewport.x/y — not fixed 2:1 isometric.
// Fixed isometric is a separate future mode; do not confuse with this module.
// World props: geometry is built in world space (prop.facing at spawn).
// Symmetric cylinders use a viewer-facing silhouette (viewAngle for rim tangents only).
export function resolveElevationAlpha(height, viewport) {
    const { cameraHeight, perspectiveStrength } = viewport;
    if (height <= 0 || cameraHeight <= height) return 0;
    return (height / (cameraHeight - height)) * perspectiveStrength;
}
export function projectWorldPointInto(out, worldX, worldY, height, viewport) {
    const alpha = resolveElevationAlpha(height, viewport);
    if (alpha <= 0) {
        out.x = worldX;
        out.y = worldY;
    } else {
        out.x = worldX + (worldX - viewport.x) * alpha;
        out.y = worldY + (worldY - viewport.y) * alpha;
    }
    return out;
}
export function projectWorldPointAtHeight(worldX, worldY, height, viewport) {
    return projectWorldPointInto({ x: 0, y: 0 }, worldX, worldY, height, viewport);
}
export function projectWorldPointToScreenInto(out, viewport, worldX, worldY, height) {
    projectWorldPointInto(out, worldX, worldY, height, viewport);
    return viewport.worldToScreenInto(out, out.x, out.y);
}
export function projectWorldAabbCornersIntoFlat(out8, bounds, height, viewport) {
    const { minX, minY, maxX, maxY } = bounds;
    projectWorldQuadInto(out8, minX, minY, maxX, minY, maxX, maxY, minX, maxY, height, viewport);
    return out8;
}
export function projectVertical(objX, objY, height, viewport) {
    const dx = objX - viewport.x;
    const dy = objY - viewport.y;
    const dist = Math.hypot(dx, dy);
    const alpha = resolveElevationAlpha(height, viewport);
    const top = projectWorldPointAtHeight(objX, objY, height, viewport);
    const viewAngle = Math.atan2(dy, dx);
    return { cx: objX, cy: objY, dx, dy, dist, alpha, topX: top.x, topY: top.y, viewAngle, height };
}
export function extrudeLocalVertsInto(baseOut, topOut, localVerts, projection, facing = 0) {
    const { cx, cy, topX, topY, alpha } = projection;
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    const count = localVerts.length / 2;
    for (let i = 0; i < count; i++) {
        const lx = localVerts[i * 2];
        const ly = localVerts[i * 2 + 1];
        const topLx = scaleAtHeight(lx, alpha, 1);
        const topLy = scaleAtHeight(ly, alpha, 1);
        baseOut[i * 2] = cx + lx * cos - ly * sin;
        baseOut[i * 2 + 1] = cy + lx * sin + ly * cos;
        topOut[i * 2] = topX + topLx * cos - topLy * sin;
        topOut[i * 2 + 1] = topY + topLx * sin + topLy * cos;
    }
    return count;
}
export function getHeightSlice(projection, baseSize, t) {
    const { cx, cy, topX, topY, alpha } = projection;
    return { centerX: cx + (topX - cx) * t, centerY: cy + (topY - cy) * t, size: scaleAtHeight(baseSize, alpha, t) };
}
export function isOutwardFaceTowardViewer(midX, midY, outwardX, outwardY, viewerX, viewerY) {
    const viewX = midX - viewerX;
    const viewY = midY - viewerY;
    return outwardX * viewX + outwardY * viewY < 0;
}
export function isFaceTowardViewer(edgeMidX, edgeMidY, originX, originY, viewerX, viewerY) {
    return isOutwardFaceTowardViewer(edgeMidX, edgeMidY, edgeMidX - originX, edgeMidY - originY, viewerX, viewerY);
}
export function getSideHighlightT(viewAngle, lightAngle = (-3 * Math.PI) / 4) {
    const lx = Math.cos(lightAngle);
    const ly = Math.sin(lightAngle);
    const nx = Math.cos(viewAngle + Math.PI / 2);
    const ny = Math.sin(viewAngle + Math.PI / 2);
    const dot = lx * nx + ly * ny;
    return Math.max(0.1, Math.min(0.9, 0.5 + dot * 0.5));
}
export function traceVisibleArc(ctx, centerX, centerY, radius, fromAngle, toAngle, viewAngle) {
    const towardViewer = viewAngle + Math.PI;
    const delta = angleDelta(fromAngle, toAngle);
    const midShort = fromAngle + delta / 2;
    const midLong = midShort + (delta > 0 ? -Math.PI : Math.PI);
    const useShort = Math.abs(angleDelta(midShort, towardViewer)) < Math.abs(angleDelta(midLong, towardViewer));
    const counterClockwise = delta > 0 ? !useShort : useShort;
    ctx.arc(centerX, centerY, radius, fromAngle, toAngle, counterClockwise);
}
export function createSideGradientAt(ctx, leftX, leftY, rightX, rightY, viewAngle, colors) {
    const t = getSideHighlightT(viewAngle);
    const grad = ctx.createLinearGradient(leftX, leftY, rightX, rightY);
    grad.addColorStop(0.0, colors.shadow);
    grad.addColorStop(Math.max(0.0, t - 0.25), colors.mid);
    grad.addColorStop(t, colors.highlight);
    grad.addColorStop(Math.min(1.0, t + 0.25), colors.mid);
    grad.addColorStop(1.0, colors.shadow);
    return grad;
}
export function projectWorldQuadInto(out8, x0, y0, x1, y1, x2, y2, x3, y3, height, viewport) {
    const alpha = resolveElevationAlpha(height, viewport);
    if (alpha <= 0) {
        out8[0] = x0;
        out8[1] = y0;
        out8[2] = x1;
        out8[3] = y1;
        out8[4] = x2;
        out8[5] = y2;
        out8[6] = x3;
        out8[7] = y3;
    } else {
        const vx = viewport.x;
        const vy = viewport.y;
        out8[0] = x0 + (x0 - vx) * alpha;
        out8[1] = y0 + (y0 - vy) * alpha;
        out8[2] = x1 + (x1 - vx) * alpha;
        out8[3] = y1 + (y1 - vy) * alpha;
        out8[4] = x2 + (x2 - vx) * alpha;
        out8[5] = y2 + (y2 - vy) * alpha;
        out8[6] = x3 + (x3 - vx) * alpha;
        out8[7] = y3 + (y3 - vy) * alpha;
    }
    return out8;
}
export function pointOnFrustumInto(out, offset, projection, baseRadius, topRadius, t, angle) {
    const { cx, cy, topX, topY } = projection;
    const radius = radiusAtT(baseRadius, topRadius, t);
    const centerX = cx + (topX - cx) * t;
    const centerY = cy + (topY - cy) * t;
    out[offset] = centerX + Math.cos(angle) * radius;
    out[offset + 1] = centerY + Math.sin(angle) * radius;
}
const sScreen = { x: 0, y: 0 };
/** Ground XY for the far edge of a roof-anchored shadow wedge. */
export function shadowGroundContactXY(lx, ly, lightZ, wx, wy, wallTopZ, farDistance = 0) {
    if (lightZ <= wallTopZ) {
        if (farDistance > 0) {
            const dx = wx - lx;
            const dy = wy - ly;
            const dist = Math.hypot(dx, dy);
            if (dist > 0) return { x: lx + (dx / dist) * farDistance, y: ly + (dy / dist) * farDistance };
        }
        return { x: wx, y: wy };
    }
    const t = lightZ / (lightZ - wallTopZ);
    return { x: lx + (wx - lx) * t, y: ly + (wy - ly) * t };
}
/** Screen-space shadow quad: near edge at projected wall top, far edge at ground contacts at z = 0. */
export function projectWallShadowQuadScreenInto(out8, viewport, lx, ly, lightZ, x1, y1, x2, y2, wallTopZ, farDistance = 0) {
    const floor1xy = shadowGroundContactXY(lx, ly, lightZ, x1, y1, wallTopZ, farDistance);
    const floor2xy = shadowGroundContactXY(lx, ly, lightZ, x2, y2, wallTopZ, farDistance);
    projectWorldPointToScreenInto(sScreen, viewport, x1, y1, wallTopZ);
    out8[0] = sScreen.x;
    out8[1] = sScreen.y;
    projectWorldPointToScreenInto(sScreen, viewport, x2, y2, wallTopZ);
    out8[2] = sScreen.x;
    out8[3] = sScreen.y;
    projectWorldPointToScreenInto(sScreen, viewport, floor2xy.x, floor2xy.y, 0);
    out8[4] = sScreen.x;
    out8[5] = sScreen.y;
    projectWorldPointToScreenInto(sScreen, viewport, floor1xy.x, floor1xy.y, 0);
    out8[6] = sScreen.x;
    out8[7] = sScreen.y;
    return 4;
}
export function projectOntoPathFrom(path, x, y, startSegmentIdx = 0) {
    if (!path || path.length === 0) return { segmentIdx: 0, t: 0, closestX: x, closestY: y, dist: 0 };
    if (path.length === 1) {
        const dist = Math.hypot(x - path[0].x, y - path[0].y);
        return { segmentIdx: 0, t: 0, closestX: path[0].x, closestY: path[0].y, dist };
    }
    const firstSegment = Math.max(0, Math.min(startSegmentIdx, path.length - 2));
    let bestDistSq = Infinity;
    let segmentIdx = firstSegment;
    let t = 0;
    let closestX = path[firstSegment].x;
    let closestY = path[firstSegment].y;
    for (let i = firstSegment; i < path.length - 1; i++) {
        const ax = path[i].x;
        const ay = path[i].y;
        const bx = path[i + 1].x;
        const by = path[i + 1].y;
        const closest = closestPointOnLineSegment(x, y, ax, ay, bx, by);
        const distSq = (x - closest.x) ** 2 + (y - closest.y) ** 2;
        if (distSq < bestDistSq) {
            bestDistSq = distSq;
            segmentIdx = i;
            t = closest.t;
            closestX = closest.x;
            closestY = closest.y;
        }
    }
    return { segmentIdx, t, closestX, closestY, dist: Math.sqrt(bestDistSq) };
}
export function projectOntoPath(x, y, path) {
    return projectOntoPathFrom(path, x, y, 0);
}
export function setBoundary(grid, idx, side, spec, bumpRevision = false) {
    const cols = grid.cols;
    const rows = grid.rows;
    if (idx < 0 || idx >= cols * rows) return false;
    if (spec === null || spec.capHeightLevel === 0) {
        clearBoundaryPrimary(grid, idx, side, bumpRevision);
        return true;
    }
    grid.writeMirroredCellEdge(idx, side, railWallEdgeFromStamp(spec.capHeightLevel, spec.thicknessLevel ?? 1, neighborFillLevel(grid, idx, side)));
    if (bumpRevision) bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    return true;
}
export function clearBoundaryPrimary(grid, idx, side, bumpRevision = false) {
    const cols = grid.cols;
    const rows = grid.rows;
    if (idx < 0 || idx >= cols * rows) return false;
    if (!isRailWallEdge(grid.getCellEdge(idx, side))) return false;
    grid.clearMirroredCellEdge(idx, side);
    if (bumpRevision) bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    return true;
}
export function clearAllBoundariesAtCell(grid, idx, bumpRevision = false) {
    let changed = false;
    for (let side = 0; side < 4; side++) if (clearBoundaryPrimary(grid, idx, side, bumpRevision)) changed = true;
    if (changed && bumpRevision) bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    return changed;
}
export function boundaryBlocksStep(grid, idx, side) {
    return isRailWallEdge(grid.getCellEdge(idx, side));
}
function beltBlocksStepFrom(grid, fromIdx, toIdx) {
    const cols = grid.cols;
    const stepSide = gridSideFromCellIdxToNeighborIdx(fromIdx, toIdx, cols);
    const fromBelt = FloorBelt.getEntryExitAtIdx(grid, fromIdx);
    const toBelt = FloorBelt.getEntryExitAtIdx(grid, toIdx);
    if (!fromBelt && !toBelt) return false;
    if (stepSide < 0) return true;
    if (fromBelt && stepSide !== fromBelt.exitSide) return true;
    if (toBelt && edgeMirrorSide(stepSide) === toBelt.exitSide) return true;
    return false;
}
/** Directional step blocking: belt entry rules + rail-wall edges. */
export function boundaryBlocksStepFrom(grid, navCardinalOpen, vertexPassability, fromIdx, toIdx) {
    if (grid.grid[toIdx] !== 0) return true;
    if (beltBlocksStepFrom(grid, fromIdx, toIdx)) return true;
    const cols = grid.cols;
    const diff = toIdx - fromIdx;
    if (diff === 1) return boundaryBlocksStep(grid, fromIdx, 1);
    if (diff === -1) return boundaryBlocksStep(grid, fromIdx, 3);
    if (diff === cols) return boundaryBlocksStep(grid, fromIdx, 2);
    if (diff === -cols) return boundaryBlocksStep(grid, fromIdx, 0);
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
                if (!boundaryBlocksStep(grid, ownerIdx, spec.ownerSide)) mask |= spec.bit;
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
    return (
        cardinalLegOpen(cardinalOpen, cols, col, row, dc, 0) &&
        cardinalLegOpen(cardinalOpen, cols, col, row, 0, dr) &&
        cardinalLegOpen(cardinalOpen, cols, shoulderHCol, shoulderHRow, 0, dr) &&
        cardinalLegOpen(cardinalOpen, cols, shoulderVCol, shoulderVRow, dc, 0)
    );
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
    return { heightDelta, thicknessLevel };
}
export function isRailWallEdge(edge) {
    return edge != null;
}
export function railWallCapLevel(edge, neighborFillLevel) {
    return neighborFillLevel + edge.heightDelta;
}
export function railWallHeightPx(edge, grid, neighborFillLevel) {
    return railWallCapLevel(edge, neighborFillLevel) * grid.cellSize;
}
export function railWallThicknessPx(edge) {
    return Math.max(1, edge.thicknessLevel);
}
export const CELL_EDGE_SLOT_BYTES = 16;
export function cellEdgeSlotOffset(idx, side) {
    return (idx << 2) + side;
}
const EMPTY = -1;
export class FloorBelt {
    static get KIND() {
        return FLOOR_CELL_KIND;
    }
    static isBelt(kind) {
        return kind >= FLOOR_CELL_KIND.Belt && kind <= FLOOR_CELL_KIND.BeltElbowRight;
    }
    static getElbowTurn(kind) {
        if (kind === FLOOR_CELL_KIND.BeltElbowLeft) return "left";
        if (kind === FLOOR_CELL_KIND.BeltElbowRight) return "right";
        return null;
    }
    static getEntryExitSides(kind, facingIndex) {
        const exitSide = (facingIndex + 1) % 4;
        let entrySide;
        if (kind === FLOOR_CELL_KIND.BeltElbowLeft) entrySide = (exitSide + 1) % 4;
        else if (kind === FLOOR_CELL_KIND.BeltElbowRight) entrySide = (exitSide + 3) % 4;
        else entrySide = (exitSide + 2) % 4;
        return { entrySide, exitSide };
    }
    static getRailEdgeSides(kind, facingIndex) {
        const { entrySide, exitSide } = FloorBelt.getEntryExitSides(kind, facingIndex);
        const sides = [];
        for (let side = 0; side < 4; side++) if (side !== entrySide && side !== exitSide) sides.push(side);
        return sides;
    }
    static formatKindLabel(kind) {
        const labels = { [FLOOR_CELL_KIND.Belt]: "Conveyor", [FLOOR_CELL_KIND.BeltElbowLeft]: "Conveyor Elbow L", [FLOOR_CELL_KIND.BeltElbowRight]: "Conveyor Elbow R" };
        return labels[kind] ?? "Belt";
    }
    static formatFacingLabel(facingIndex) {
        const labels = ["E", "S", "W", "N"];
        return labels[facingIndex % CARDINAL_FACING_STEPS];
    }
    static resolveKindFromSides(entrySide, exitSide) {
        const facingIndex = (exitSide + 3) % 4;
        let kind = FLOOR_CELL_KIND.Belt;
        if (entrySide === (exitSide + 1) % 4) kind = FLOOR_CELL_KIND.BeltElbowLeft;
        else if (entrySide === (exitSide + 3) % 4) kind = FLOOR_CELL_KIND.BeltElbowRight;
        return { kind, facingIndex };
    }
    static getFacingAngle(facingIndex) {
        return (facingIndex % CARDINAL_FACING_STEPS) * ((Math.PI * 2) / CARDINAL_FACING_STEPS);
    }
    static getEntryEdgeWorldPoint(grid, idx, entrySide) {
        const x = grid.gridCenterXByIdx(idx);
        const y = grid.gridCenterYByIdx(idx);
        const inset = grid.cellSize * 0.35;
        if (entrySide === 0) return { x, y: y - inset };
        if (entrySide === 1) return { x: x + inset, y };
        if (entrySide === 2) return { x, y: y + inset };
        return { x: x - inset, y };
    }
    static getEntryExitAtIdx(grid, idx) {
        if (idx < 0 || idx >= grid.cols * grid.rows) return null;
        const kind = grid.floorKind[idx];
        if (!FloorBelt.isBelt(kind)) return null;
        return FloorBelt.getEntryExitSides(kind, grid.floorFacing[idx]);
    }
    static isBeltAtIdx(grid, idx) {
        if (idx < 0 || idx >= grid.cols * grid.rows) return false;
        return grid.floorKind[idx] !== 0;
    }
    static isEntityOnBelt(grid, x, y) {
        return FloorBelt.isBeltAtIdx(grid, grid.worldToIdx(x, y));
    }
    static pickRotatableOccupantAtWorld(state, worldX, worldY) {
        const grid = state.obstacleGrid;
        const idx = grid.worldToIdx(worldX, worldY);
        if (idx < 0) return -1;
        if (grid.floorKind[idx] !== 0) return idx;
        return -1;
    }
    static rotateOccupantAt(state, occupant, steps = 1, onCommit = null) {
        const grid = state.obstacleGrid;
        const idx = occupant;
        if (!(grid.floorKind[idx] !== 0)) return false;
        const beltKind = grid.floorKind[idx];
        const facingIndex = (((grid.floorFacing[idx] + steps) % 4) + 4) % 4;
        grid.writeFloorCell(idx, beltKind, facingIndex);
        if (onCommit) onCommit(state, idx);
        return true;
    }
    static canStampAt(state, idx) {
        const grid = state.obstacleGrid;
        if (idx < 0 || idx >= grid.cols * grid.rows) return false;
        if (grid.isBlockedIdx(idx)) return false;
        if (grid.hasFloorOccupancy(idx)) return false;
        return true;
    }
    static clearOverlayAt(state, idx) {
        const grid = state.obstacleGrid;
        if (idx < 0 || idx >= grid.cols * grid.rows) return false;
        if (!grid.clearFloorCell(idx)) return false;
        FloorBelt.markZoneSubscriptionsDirty(state);
        return true;
    }
    static listPlacedForSnapshot(grid) {
        const items = [];
        const size = grid.cols * grid.rows;
        const cellSize = grid.cellSize;
        for (let idx = 0; idx < size; idx++) {
            if (!(grid.floorKind[idx] !== 0)) continue;
            items.push({ idx, kind: grid.floorKind[idx], facingIndex: grid.floorFacing[idx] });
        }
        return items;
    }
    static applyFromSnapshot(state, doc) {
        const grid = state.obstacleGrid;
        const half = grid.cellHalfSize;
        const bounds = emptyCellBounds();
        const cellSize = doc.cellSize ?? grid.cellSize;
        let floorNavChanged = false;
        for (let i = 0; i < doc.floorBelts.length; i++) {
            const { idx: docIdx, kind, facingIndex } = doc.floorBelts[i];
            if (!FloorBelt.isBelt(kind)) throw new Error(`Invalid floor belt kind: ${kind}`);
            const idx = grid.worldToIdx(doc.origin.minX + (docIdx % doc.cols) * cellSize + half, doc.origin.minY + Math.floor(docIdx / doc.cols) * cellSize + half);
            if (idx < 0 || idx >= grid.cols * grid.rows) continue;
            const prevKind = grid.floorKind[idx];
            const prevFacing = grid.floorFacing[idx];
            const facing = ((facingIndex % 4) + 4) % 4;
            if (prevKind !== kind || prevFacing !== facing) floorNavChanged = true;
            grid.floorKind[idx] = kind;
            grid.floorFacing[idx] = facing;
            growCellBoundsIdx(bounds, idx, grid);
        }
        if (floorNavChanged) bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Floor);
        if (isEmptyCellBounds(bounds)) return null;
        FloorBelt.markZoneSubscriptionsDirty(state);
        bumpFloorOccupancyStampDrawRevision(grid);
        FloorBelt.recomputeFloorBeltCount(grid);
        return bounds;
    }
    static recomputeFloorBeltCount(grid) {
        let count = 0;
        const size = grid.cols * grid.rows;
        for (let idx = 0; idx < size; idx++) if (FloorBelt.isBelt(grid.floorKind[idx])) count++;
        grid.floorBeltCount = count;
    }
    static markZoneSubscriptionsDirty(state) {
        state.sandbox.gridZoneSubscriptionsDirty = true;
    }
    static buildZoneSubscriptions(grid) {
        const cells = new Set();
        if (!grid.cols) return { cells };
        const size = grid.cols * grid.rows;
        for (let idx = 0; idx < size; idx++) if (grid.floorKind[idx] !== 0) cells.add(idx);
        return { cells };
    }
    static ensureZoneSubscriptions(state) {
        if (!state.sandbox.gridZoneSubscriptionsDirty && state.sandbox.gridZoneSubscriptions) return state.sandbox.gridZoneSubscriptions;
        state.sandbox.gridZoneSubscriptions = FloorBelt.buildZoneSubscriptions(state.obstacleGrid);
        state.sandbox.gridZoneSubscriptionsDirty = false;
        return state.sandbox.gridZoneSubscriptions;
    }
    static onCellZoneEvent(state, event, phase) {
        if (phase === "on") return;
        if (!state.sandbox.beltZoneEvents) state.sandbox.beltZoneEvents = [];
        state.sandbox.beltZoneEvents.push({ at: state.gameTime, phase, idx: event.idx, entityId: event.entity.id });
        if (state.sandbox.beltZoneEvents.length > 32) state.sandbox.beltZoneEvents.shift();
    }
    static tickZones(state, spatialFrame) {
        const grid = state.obstacleGrid;
        const subscriptions = FloorBelt.ensureZoneSubscriptions(state);
        if (!subscriptions.cells.size) return;
        tickGridZoneMembership(spatialFrame, grid, subscriptions, {
            onEnter(event) {
                grid._floorBeltLoad[event.idx]++;
                FloorBelt.onCellZoneEvent(state, event, "enter");
            },
            onOn(event) {
                FloorBelt.onCellZoneEvent(state, event, "on");
            },
            onExit(event) {
                const load = grid._floorBeltLoad[event.idx];
                if (load > 0) grid._floorBeltLoad[event.idx] = load - 1;
                FloorBelt.onCellZoneEvent(state, event, "exit");
            },
        });
    }
    static tickAnim(state, dt) {
        const grid = state.obstacleGrid;
        if (grid.floorBeltCount === 0) return;
        const subscriptions = FloorBelt.ensureZoneSubscriptions(state);
        for (const idx of subscriptions.cells) {
            if (!FloorBelt.isBelt(grid.floorKind[idx])) continue;
            if (grid._floorBeltLoad[idx] > 0) grid._floorBeltAnimMs[idx] += dt;
        }
    }
    static tickOccupancy(state, spatialFrame, dt, applyAcceleration = null) {
        const grid = state.obstacleGrid;
        if (grid.floorBeltCount === 0) return;
        const kineticBodies = spatialFrame._kineticBodies;
        if (!kineticBodies?.length) return;
        const dtSec = dt / 1000;
        const force = DEFAULT_FLOOR_BELT_FORCE;
        for (let i = 0; i < kineticBodies.length; i++) {
            const entity = kineticBodies[i];
            const idx = grid.worldToIdx(entity.x, entity.y);
            if (idx < 0) continue;
            if (!(grid.floorKind[idx] !== 0)) continue;
            const kind = grid.floorKind[idx];
            const facingIndex = grid.floorFacing[idx];
            const cx = grid.gridCenterXByIdx(idx);
            const cy = grid.gridCenterYByIdx(idx);
            let ax = 0,
                ay = 0;
            if (kind === FLOOR_CELL_KIND.Belt) {
                const beltAngle = FloorBelt.getFacingAngle(facingIndex);
                const flowX = Math.cos(beltAngle);
                const flowY = Math.sin(beltAngle);
                const normalX = -flowY;
                const normalY = flowX;
                const dispX = cx - entity.x;
                const dispY = cy - entity.y;
                const lateralOffset = dispX * normalX + dispY * normalY;
                const lateralForceMagnitude = (lateralOffset / grid.cellHalfSize) * force * 1.5;
                const v_lateral = (entity.vx || 0) * normalX + (entity.vy || 0) * normalY;
                const lateralDamping = -v_lateral * 5.0;
                ax = flowX * force + normalX * (lateralForceMagnitude + lateralDamping);
                ay = flowY * force + normalY * (lateralForceMagnitude + lateralDamping);
            } else {
                const { entrySide, exitSide } = FloorBelt.getEntryExitSides(kind, facingIndex);
                const DIR_X = [0, 1, 0, -1];
                const DIR_Y = [-1, 0, 1, 0];
                const pDx = DIR_X[entrySide] + DIR_X[exitSide];
                const pDy = DIR_Y[entrySide] + DIR_Y[exitSide];
                const pivotX = cx + pDx * grid.cellHalfSize;
                const pivotY = cy + pDy * grid.cellHalfSize;
                const dx = entity.x - pivotX;
                const dy = entity.y - pivotY;
                const dist = Math.hypot(dx, dy);
                const turn = FloorBelt.getElbowTurn(kind);
                const isLeft = turn === "left";
                let rX = 0,
                    rY = 0,
                    tX = 0,
                    tY = 0;
                if (dist > 0.001) {
                    rX = dx / dist;
                    rY = dy / dist;
                    tX = isLeft ? -rY : rY;
                    tY = isLeft ? rX : -rX;
                } else {
                    const angle = FloorBelt.getFacingAngle(facingIndex);
                    tX = Math.cos(angle);
                    tY = Math.sin(angle);
                }
                const diff = dist - grid.cellHalfSize;
                const springForce = -(diff / (grid.cellHalfSize * 0.5)) * force * 1.5;
                const v_radial = (entity.vx || 0) * rX + (entity.vy || 0) * rY;
                const damping = -v_radial * 5.0;
                ax = tX * force + rX * (springForce + damping);
                ay = tY * force + rY * (springForce + damping);
            }
            if (applyAcceleration) applyAcceleration(entity, ax, ay, dtSec);
        }
    }
}
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
function formatGlobalCellIdx(idx) {
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
export const GRID_NAV_EPOCH = { Wall: "wall", Floor: "floor", Topology: "topology" };
/**
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {(typeof GRID_NAV_EPOCH)[keyof typeof GRID_NAV_EPOCH]} channel
 */
export function bumpGridNavEpoch(grid, channel) {
    switch (channel) {
        case GRID_NAV_EPOCH.Wall:
            grid.wallGridRevision = (grid.wallGridRevision + 1) | 0;
            grid.invalidateStructureZLevelsCache();
            grid.invalidateNavTopology();
            return;
        case GRID_NAV_EPOCH.Floor:
            grid.floorNavEpoch = (grid.floorNavEpoch + 1) | 0;
            grid.invalidateNavTopology();
            return;
        case GRID_NAV_EPOCH.Topology:
            grid.gridTopologyEpoch = (grid.gridTopologyEpoch + 1) | 0;
            return;
    }
    throw new Error(`unknown grid nav epoch channel: ${channel}`);
}
/** Canonical live topology key — every staleness check derives from this. */
export function gridNavCacheKey(grid) {
    return `${grid.wallGridRevision}:${grid.gridTopologyEpoch}:${grid.floorNavEpoch}`;
}
/**
 * @param {import("../../Pathfinding/HpaPathWorker.js").HpaPathWorker} hpaPathWorker
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
export function layoutCellRows(layout) {
    return layout.cellCount / layout.strideCols;
}
export function layoutIndexToGlobalIndex(localIdx, originIdx, layoutCols, strideCols) {
    return stampGlobalIdx(originIdx, localIdx, layoutCols, strideCols);
}
export function globalIndexToLayoutLocal(globalIdx, originIdx, layoutCols, strideCols) {
    const delta = globalIdx - originIdx;
    const q = (delta / layoutCols) | 0;
    return q * strideCols + (delta - q * layoutCols);
}
export function layoutIndicesToGlobalIndices(indices, originIdx, layoutCols, strideCols) {
    const out = [];
    for (const idx of indices) out.push(layoutIndexToGlobalIndex(idx, originIdx, layoutCols, strideCols));
    return out;
}
/** @param {number} aIdx @param {number} bIdx @param {number} cellCount */
export function undirectedPairIndex(aIdx, bIdx, cellCount) {
    return aIdx < bIdx ? aIdx * cellCount + bIdx : bIdx * cellCount + aIdx;
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
export function formatGridSideNeighborLabel(side) {
    return GRID_SIDE_NEIGHBOR_LABELS[side] ?? `Side ${side} neighbor`;
}
const GRID_EDGE_SIDE_FACING = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
/** Facing radians for grid edge side 0=N, 1=E, 2=S, 3=W. */
export function gridEdgeSideFacing(side) {
    return GRID_EDGE_SIDE_FACING[side];
}
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
    for (let ref = 0; ref < pool.length; ref++) writeEdgeToSab(view, ref, pool[ref]);
    return pool.length;
}
/** @param {DataView} view @param {number} ref @param {object | undefined} edge */
function writeEdgeToSab(view, ref, edge) {
    const base = ref * NAV_EDGE_POOL_SAB_STRIDE;
    view.setInt16(base + 0, edge?.heightDelta ?? 0, true);
    view.setUint8(base + 2, edge?.thicknessLevel ?? 1);
}
/** Worker-owned pool objects — updated in place from SAB each nav sync. */
const workerEdgePool = [];
/** @param {Uint8Array} bytes @param {number} refCount */
export function bindNavEdgePoolFromSab(bytes, refCount) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    while (workerEdgePool.length < refCount) workerEdgePool.push({ heightDelta: 0, thicknessLevel: 1 });
    for (let ref = 0; ref < refCount; ref++) readEdgeFromSab(view, ref, workerEdgePool[ref]);
    workerEdgePool.length = refCount;
    return workerEdgePool;
}
/** @param {DataView} view @param {number} ref @param {Record<string, unknown>} out */
function readEdgeFromSab(view, ref, out) {
    const base = ref * NAV_EDGE_POOL_SAB_STRIDE;
    out.heightDelta = view.getInt16(base + 0, true);
    out.thicknessLevel = view.getUint8(base + 2) || 1;
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
            const newAxis0 = remapChunkCoord(axis0, colOffset, cellsPerChunk);
            const newAxis1 = remapChunkCoord(axis1, rowOffset, cellsPerChunk);
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
        return (
            this.edgeProfileIds.has(cellEdgeSlotOffset(idx, 0)) ||
            this.edgeProfileIds.has(cellEdgeSlotOffset(idx, 1)) ||
            this.edgeProfileIds.has(cellEdgeSlotOffset(idx, 2)) ||
            this.edgeProfileIds.has(cellEdgeSlotOffset(idx, 3))
        );
    }
}
export function resolveChunkBaseProfileIdAtIdx(grid, idx, cellsPerChunk, baseProfileId) {
    return resolveChunkSurfaceProfileIdAtKey(grid, cellIdxToChunkKey(idx, grid, cellsPerChunk), baseProfileId);
}
export function resolveSurfaceProfileId(grid, ownerKind, baseProfileId, cellsPerChunk, a, b = 0, c = 0, face = null) {
    if (ownerKind === SURFACE_MATERIAL_OWNER.Chunk) return grid.surfaceMaterials.getChunkAtKey(a) ?? baseProfileId;
    if (ownerKind === SURFACE_MATERIAL_OWNER.Cell) {
        const chunkBase = cellsPerChunk > 0 ? resolveChunkBaseProfileIdAtIdx(grid, a, cellsPerChunk, baseProfileId) : baseProfileId;
        return grid.surfaceMaterials.getCellAtIdx(a) ?? chunkBase;
    }
    if (ownerKind === SURFACE_MATERIAL_OWNER.WallFace) {
        const chunkBase = cellsPerChunk > 0 ? resolveChunkBaseProfileIdAtIdx(grid, face.gridIdx, cellsPerChunk, baseProfileId) : baseProfileId;
        if (face.isEdgeRail) return grid.surfaceMaterials.getEdgeByIdx(face.gridIdx, face.gridSide) ?? chunkBase;
        return grid.surfaceMaterials.getCellAtIdx(face.gridIdx) ?? chunkBase;
    }
    throw new Error(`unknown surface material owner kind: ${ownerKind}`);
}
export function resolveCellSurfaceProfileId(grid, idx, baseProfileId, cellsPerChunk = 0) {
    return resolveSurfaceProfileId(grid, SURFACE_MATERIAL_OWNER.Cell, baseProfileId, cellsPerChunk, idx);
}
export function resolveEdgeSurfaceProfileId(grid, idx, side, baseProfileId, cellsPerChunk = 0) {
    const chunkBase = cellsPerChunk > 0 ? resolveChunkBaseProfileIdAtIdx(grid, idx, cellsPerChunk, baseProfileId) : baseProfileId;
    return grid.surfaceMaterials.getEdgeByIdx(idx, side) ?? chunkBase;
}
export function resolveWallSurfaceProfileId(grid, face, baseProfileId, cellsPerChunk = 0) {
    return resolveSurfaceProfileId(grid, SURFACE_MATERIAL_OWNER.WallFace, baseProfileId, cellsPerChunk, 0, 0, 0, face);
}
export function resolveChunkSurfaceProfileIdAtKey(grid, chunkKey, baseProfileId) {
    return resolveSurfaceProfileId(grid, SURFACE_MATERIAL_OWNER.Chunk, baseProfileId, 0, chunkKey);
}
const EDGE_PROXY_P1 = { x: 0, y: 0 };
const EDGE_PROXY_P2 = { x: 0, y: 0 };
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
        this.cellEdgePool = [];
        this.cellEdgeFree = [];
        this.floorKind = new Uint8Array(0);
        this.floorFacing = new Uint8Array(0);
        this.floorBeltCount = 0;
        this._floorBeltLoad = new Uint8Array(0);
        this._floorBeltAnimMs = new Uint32Array(0);
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
        this._staticWallProxies = [];
        this._staticWallProxyCount = 0;
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
            const pooled = this.cellEdgePool[ref];
            pooled.heightDelta = edge.heightDelta;
            pooled.thicknessLevel = edge.thicknessLevel;
            return ref;
        }
        const ref = this.cellEdgePool.length;
        this.cellEdgePool.push(edge);
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
    _borrowStaticWallProxy(x, y, idx) {
        const size = this.cellSize;
        let proxy = this._staticWallProxies[this._staticWallProxyCount];
        if (!proxy) {
            proxy = {
                _obstacleGrid: undefined,
                x: 0,
                y: 0,
                angle: 0,
                width: 0,
                height: 0,
                size: 0,
                padding: 0,
                isDead: false,
                isStaticGridProxy: false,
                isStaticGridFace: false,
                isEdgeRail: false,
                gridIdx: 0,
                gridSide: 0,
                shape: undefined,
            };
            this._staticWallProxies[this._staticWallProxyCount] = proxy;
        }
        this._staticWallProxyCount++;
        proxy._obstacleGrid = this;
        proxy.x = x;
        proxy.y = y;
        proxy.angle = 0;
        proxy.size = size;
        proxy.width = size;
        proxy.height = size;
        proxy.shape = undefined;
        proxy.gridIdx = idx;
        proxy.isStaticGridProxy = true;
        proxy.isStaticGridFace = false;
        proxy.isEdgeRail = false;
        proxy.gridSide = 0;
        return proxy;
    }
    resetStaticWallProxyPool() {
        this._staticWallProxyCount = 0;
    }
    appendStaticWallProxiesNearWorld(worldX, worldY, queryRadius, out) {
        const ec = this.worldCol(worldX);
        const er = this.worldRow(worldY);
        const pad = 1 + Math.ceil(queryRadius / this.cellSize);
        const minCol = Math.max(0, ec - pad);
        const maxCol = Math.min(this.cols - 1, ec + pad);
        const minRow = Math.max(0, er - pad);
        const maxRow = Math.min(this.rows - 1, er + pad);
        forEachDenseCellInRect(this, minCol, maxCol, minRow, maxRow, (idx) => {
            if (this.grid[idx] !== 0) out.push(this._borrowStaticWallProxy(this.gridCenterXByIdx(idx), this.gridCenterYByIdx(idx), idx));
            for (let side = 0; side < 4; side++) {
                if (!railWallEdgeShouldEmit(this, idx, side)) continue;
                const thickness = edgeRailCollisionThicknessPx(this, idx, side);
                cellEdgeEndpointsIdx(this, idx, side, EDGE_PROXY_P1, EDGE_PROXY_P2, 0);
                const p1x = EDGE_PROXY_P1.x;
                const p1y = EDGE_PROXY_P1.y;
                const p2x = EDGE_PROXY_P2.x;
                const p2y = EDGE_PROXY_P2.y;
                const dx = p2x - p1x;
                const dy = p2y - p1y;
                const len = Math.hypot(dx, dy);
                let proxy = this._staticWallProxies[this._staticWallProxyCount];
                if (!proxy) {
                    proxy = {
                        _obstacleGrid: undefined,
                        x: 0,
                        y: 0,
                        angle: 0,
                        width: 0,
                        height: 0,
                        size: 0,
                        padding: 0,
                        isDead: false,
                        isStaticGridProxy: false,
                        isStaticGridFace: false,
                        isEdgeRail: false,
                        gridIdx: 0,
                        gridSide: 0,
                        shape: undefined,
                    };
                    this._staticWallProxies[this._staticWallProxyCount] = proxy;
                } else {
                    proxy.x = 0;
                    proxy.y = 0;
                    proxy.angle = 0;
                    proxy.width = 0;
                    proxy.height = 0;
                    proxy.size = 0;
                    proxy.padding = 0;
                    proxy.isDead = false;
                    proxy.shape = undefined;
                }
                this._staticWallProxyCount++;
                proxy._obstacleGrid = this;
                proxy.isStaticGridFace = true;
                proxy.isStaticGridProxy = false;
                proxy.isEdgeRail = true;
                proxy.gridIdx = idx;
                proxy.gridSide = side;
                proxy.x = (p1x + p2x) * 0.5;
                proxy.y = (p1y + p2y) * 0.5;
                proxy.angle = Math.atan2(dy, dx);
                proxy.width = len;
                proxy.height = thickness;
                proxy.size = Math.max(len, thickness);
                out.push(proxy);
            }
        });
        return out;
    }
    appendStaticWallProxiesNear(entity, out) {
        return this.appendStaticWallProxiesNearWorld(entity.x, entity.y, entityBroadphaseExtent(entity), out);
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
        this.cellEdgePool.length = 0;
        this.cellEdgeFree.length = 0;
        this.floorKind = new Uint8Array(size);
        this.floorFacing = new Uint8Array(size);
        this.floorBeltCount = 0;
        this._floorBeltLoad = new Uint8Array(size);
        this._floorBeltAnimMs = new Uint32Array(size);
        this.staticPropBuckets.clear();
        this.staticPropCount = new Uint16Array(size);
        this.staticPropTotalCount = 0;
        this.surfaceMaterials.reset(this.cols, this.rows);
        bumpSurfaceMaterialRevision(this);
        this.invalidateStructureZLevelsCache();
        this.invalidateNavTopology();
        bumpGridNavEpoch(this, GRID_NAV_EPOCH.Topology);
        if (this.onBoundsResync) this.onBoundsResync(this);
    }
    expandToCoverAabb(aabb) {
        if (this.cols <= 0) {
            const width = aabb.maxX - aabb.minX;
            const height = aabb.maxY - aabb.minY;
            this.rebuildFixed((aabb.minX + aabb.maxX) / 2, (aabb.minY + aabb.maxY) / 2, width, height);
            return true;
        }
        const newMinX = Math.min(this.minX, aabb.minX);
        const newMinY = Math.min(this.minY, aabb.minY);
        const newMaxX = Math.max(this.maxX, aabb.maxX);
        const newMaxY = Math.max(this.maxY, aabb.maxY);
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
        const oldFloorKind = this.floorKind;
        const oldFloorFacing = this.floorFacing;
        const oldFloorBeltLoad = this._floorBeltLoad;
        const oldFloorBeltAnimMs = this._floorBeltAnimMs;
        const oldSurfaceMaterials = this.surfaceMaterials.snapshot();
        const oldSize = oldCols * oldRows;
        const newEdgeSlots = new Int32Array(this.cols * this.rows * 4);
        newEdgeSlots.fill(EMPTY);
        const newFloorKind = new Uint8Array(this.cols * this.rows);
        const newFloorFacing = new Uint8Array(this.cols * this.rows);
        const newFloorBeltLoad = new Uint8Array(this.cols * this.rows);
        const newFloorBeltAnimMs = new Uint32Array(this.cols * this.rows);
        let floorBeltCount = 0;
        for (let idx = 0; idx < oldSize; idx++) {
            const level = oldGrid[idx];
            if (level === 0 && !this.hasAnyCellEdgeAtIdx(idx) && this.floorKind[idx] === 0 && !this.surfaceMaterials.hasAnyCellAtIdx(idx) && !this.surfaceMaterials.hasAnyEdgeAtIdx(idx)) continue;
            const col = idx % oldCols;
            const row = (idx / oldCols) | 0;
            const nc = col + colOffset;
            const nr = row + rowOffset;
            if (nc >= 0 && nc < this.cols && nr >= 0 && nr < this.rows) {
                const newIdx = nc + nr * this.cols;
                if (cellInRect(newIdx, this)) {
                    newGrid[newIdx] = level;
                    if (this.floorKind[idx] !== 0) {
                        newFloorKind[newIdx] = this.floorKind[idx];
                        newFloorFacing[newIdx] = this.floorFacing[idx];
                        newFloorBeltLoad[newIdx] = oldFloorBeltLoad[idx];
                        newFloorBeltAnimMs[newIdx] = oldFloorBeltAnimMs[idx];
                        if (FloorBelt.isBelt(this.floorKind[idx])) floorBeltCount++;
                    }
                    for (let side = 0; side < 4; side++) newEdgeSlots[(newIdx << 2) + side] = this.cellEdgeSlots[(idx << 2) + side];
                }
            }
        }
        this.cellEdgeSlots = newEdgeSlots;
        this.floorKind = newFloorKind;
        this.floorFacing = newFloorFacing;
        this._floorBeltLoad = newFloorBeltLoad;
        this._floorBeltAnimMs = newFloorBeltAnimMs;
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
        bumpGridNavEpoch(this, GRID_NAV_EPOCH.Topology);
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
        if (changed) bumpGridNavEpoch(this, GRID_NAV_EPOCH.Wall);
        return gridBounds;
    }
    stampCellEdge(idx, side, capHeightLevel, thicknessLevel = 1) {
        setBoundary(this, idx, side, { capHeightLevel, thicknessLevel }, true);
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
    writeFloorCell(idx, kind, facingIndex) {
        if (this.isBlockedIdx(idx)) return false;
        const prevKind = this.floorKind[idx];
        const prevFacing = this.floorFacing[idx];
        const wasBelt = FloorBelt.isBelt(prevKind);
        const isBelt = FloorBelt.isBelt(kind);
        if (!wasBelt && isBelt) this.floorBeltCount++;
        else if (wasBelt && !isBelt) {
            this.floorBeltCount--;
            this._floorBeltLoad[idx] = 0;
            this._floorBeltAnimMs[idx] = 0;
        }
        this.floorKind[idx] = kind;
        this.floorFacing[idx] = facingIndex;
        const floorNavChanged = (wasBelt || isBelt) && (prevKind !== kind || prevFacing !== facingIndex);
        if (floorNavChanged) bumpGridNavEpoch(this, GRID_NAV_EPOCH.Floor);
        bumpFloorOccupancyStampDrawRevision(this);
        return true;
    }
    hasFloorOccupancy(idx) {
        if (idx < 0 || idx >= this.cols * this.rows) return false;
        return this.floorKind[idx] !== 0;
    }
    clearFloorCell(idx) {
        if (idx < 0 || idx >= this.cols * this.rows) return false;
        if (!(this.floorKind[idx] !== 0)) return false;
        const kind = this.floorKind[idx];
        if (FloorBelt.isBelt(kind)) {
            bumpGridNavEpoch(this, GRID_NAV_EPOCH.Floor);
            this.floorBeltCount--;
        }
        this.floorKind[idx] = 0;
        this.floorFacing[idx] = 0;
        this._floorBeltLoad[idx] = 0;
        this._floorBeltAnimMs[idx] = 0;
        bumpFloorOccupancyStampDrawRevision(this);
        return true;
    }
    clearAllFloorCells() {
        this.floorKind.fill(0);
        this.floorFacing.fill(0);
        this._floorBeltLoad.fill(0);
        this._floorBeltAnimMs.fill(0);
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
    getCellBoundsByIdx(idx) {
        const cols = this.cols;
        const minX = this.minX + (idx % cols) * this.cellSize;
        const minY = this.minY + ((idx / cols) | 0) * this.cellSize;
        return minCornerAabb(minX, minY, this.cellSize, this.cellSize);
    }
}
/**
 * A generic perceivable prop category system based on obstacle-grid cells.
 * Maps prop instances to the nav-grid aligned bucket grid.
 */
export class CellPropIndex {
    constructor() {
        this.buckets = new SparseBucketGrid();
        this.count = new Uint16Array(0);
        this.minX = 0;
        this.minY = 0;
        this.cols = 0;
        this.rows = 0;
        this.cellSize = 16;
        this._totalCount = 0;
    }
    _propToCellIdx(prop) {
        if (!this.cols || !this.rows) return -1;
        const col = Math.floor((prop.x - this.minX) / this.cellSize);
        const row = Math.floor((prop.y - this.minY) / this.cellSize);
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return -1;
        return col + row * this.cols;
    }
    register(prop) {
        if (prop._cellIndexCell !== undefined && prop._cellIndexCell !== -1) return;
        const idx = this._propToCellIdx(prop);
        prop._cellIndexCell = idx;
        if (idx !== -1) {
            this.buckets.push(idx, prop);
            this.count[idx]++;
            this._totalCount++;
        }
    }
    unregister(prop) {
        const idx = prop._cellIndexCell;
        if (idx !== undefined && idx !== -1)
            if (this.buckets.removeFrom(idx, prop)) {
                this.count[idx]--;
                this._totalCount--;
            }
        prop._cellIndexCell = -1;
    }
    reconcile(prop) {
        if (prop._cellIndexCell === undefined) return;
        const newIdx = this._propToCellIdx(prop);
        if (prop._cellIndexCell === newIdx) return;
        this.unregister(prop);
        this.register(prop);
    }
    totalCount() {
        return this._totalCount;
    }
    findNearest(x, y, accept = null) {
        let nearest = null;
        let bestDistSq = Infinity;
        for (const list of this.buckets.cells.values())
            for (let i = 0; i < list.length; i++) {
                const item = list[i];
                if (accept && !accept(item)) continue;
                const dx = item.x - x;
                const dy = item.y - y;
                const distSq = dx * dx + dy * dy;
                if (distSq < bestDistSq) {
                    bestDistSq = distSq;
                    nearest = item;
                }
            }
        return nearest;
    }
    findFirst(accept = null) {
        for (const list of this.buckets.cells.values())
            for (let i = 0; i < list.length; i++) {
                const item = list[i];
                if (!accept || accept(item)) return item;
            }
        return null;
    }
    forEachRegistered(fn) {
        for (const list of this.buckets.cells.values()) for (let i = 0; i < list.length; i++) if (fn(list[i]) === true) return;
    }
    countAtIdx(idx) {
        if (idx < 0 || idx >= this.count.length) return 0;
        return this.count[idx];
    }
    syncBounds(grid) {
        if (this.cols === grid.cols && this.rows === grid.rows && this.cellSize === grid.cellSize && this.minX === grid.minX && this.minY === grid.minY) return;
        this.minX = grid.minX;
        this.minY = grid.minY;
        this.cols = grid.cols;
        this.rows = grid.rows;
        this.cellSize = grid.cellSize;
        const allProps = [];
        for (const list of this.buckets.cells.values()) for (let i = 0; i < list.length; i++) allProps.push(list[i]);
        this.buckets.clear();
        this.count = new Uint16Array(this.cols * this.rows);
        this._totalCount = 0;
        for (let i = 0; i < allProps.length; i++) {
            const prop = allProps[i];
            prop._cellIndexCell = -1; // reset before registering
            this.register(prop);
        }
    }
}
/** @typedef {import("../query/SpatialQuery.js").SpatialQuery} SpatialQueryType */
/** @typedef {import("../../Math/Aabb2D.js").Aabb2D} Aabb2D */
let CURRENT_COLLECT_OUT = null;
const COLLECT_NEARBY_PUSH = (other) => {
    CURRENT_COLLECT_OUT.push(other);
};
export class EntityGrid {
    constructor(cellSize) {
        this.cellSize = cellSize;
        this.minX = 0;
        this.minY = 0;
        this.cols = 0;
        this.rows = 0;
        this.cellHead = new Int32Array(0);
        this.entityNext = new Int32Array(MAX_ENTITIES).fill(-1);
        this.entities = new Array(MAX_ENTITIES);
        this.activeEntities = [];
        this.queryGen = 0;
        this.maxInsertedExtent = 0;
        this.queryBoundsScratch = createAabb();
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
        for (let i = 0; i < this.activeEntities.length; i++) {
            const ent = this.activeEntities[i];
            if (ent._gridTileIdx !== undefined && ent._gridTileIdx !== -1) {
                this.cellHead[ent._gridTileIdx] = -1;
                this.entityNext[ent._physId] = -1;
                ent._gridTileIdx = -1;
            }
            this.entities[ent._physId] = null;
        }
        this.activeEntities.length = 0;
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
    insert(entity) {
        if (entity._physId === undefined) {
            console.error("Entity missing _physId", entity);
            return;
        }
        if (entity._physId >= this.entityNext.length) {
            const newNext = new Int32Array(this.entityNext.length * 2).fill(-1);
            newNext.set(this.entityNext);
            this.entityNext = newNext;
            this.entities.length = this.entityNext.length;
        }
        const idx = this._getCellIndex(entity.x, entity.y);
        entity._gridTileIdx = idx;
        this.entities[entity._physId] = entity;
        this.activeEntities.push(entity);
        const extent = entityBroadphaseExtent(entity);
        if (extent > this.maxInsertedExtent) this.maxInsertedExtent = extent;
        if (idx !== -1) {
            this.entityNext[entity._physId] = this.cellHead[idx];
            this.cellHead[idx] = entity._physId;
        } else this.entityNext[entity._physId] = -1;
    }
    remove(entity) {
        const idx = entity._gridTileIdx;
        if (idx === -1 || idx === undefined || idx < 0 || idx >= this.cellHead.length) return;
        const targetId = entity._physId;
        let curr = this.cellHead[idx];
        let prev = -1;
        while (curr !== -1 && curr !== undefined) {
            if (curr === targetId) {
                if (prev !== -1) this.entityNext[prev] = this.entityNext[curr];
                else this.cellHead[idx] = this.entityNext[curr];
                this.entityNext[curr] = -1;
                break;
            }
            prev = curr;
            curr = this.entityNext[curr];
        }
        entity._gridTileIdx = -1;
        this.entities[targetId] = null;
    }
    /**
     * @param {Aabb2D} bounds
     * @param {object | null} exclude
     * @param {number} queryGen
     * @param {(entity: object) => void} fn
     */
    forEachInBounds(bounds, exclude, queryGen, fn) {
        const minCol = Math.max(0, Math.floor((bounds.minX - this.minX) / this.cellSize));
        const maxCol = Math.min(this.cols - 1, Math.floor((bounds.maxX - this.minX) / this.cellSize));
        const minRow = Math.max(0, Math.floor((bounds.minY - this.minY) / this.cellSize));
        const maxRow = Math.min(this.rows - 1, Math.floor((bounds.maxY - this.minY) / this.cellSize));
        if (minCol > maxCol || minRow > maxRow) return;
        const cellHead = this.cellHead;
        const entityNext = this.entityNext;
        const entities = this.entities;
        const cols = this.cols;
        for (let row = minRow; row <= maxRow; row++) {
            const rowOffset = row * cols;
            for (let col = minCol; col <= maxCol; col++) {
                const cellIdx = rowOffset + col;
                let curr = cellHead[cellIdx];
                if (curr === -1) continue;
                while (curr !== -1) {
                    const other = entities[curr];
                    if (other && other !== exclude && other._spatialGen !== queryGen) {
                        other._spatialGen = queryGen;
                        fn(other);
                    }
                    curr = entityNext[curr];
                }
            }
        }
    }
    /**
     * Entities whose grid cell falls inside a world AABB. Because bodies are indexed at
     * their center point, bounds are expanded by maxInsertedExtent + neighborQueryPad
     * unless expandForEntityExtents is false.
     *
     * @param {Aabb2D} bounds
     * @param {SpatialQueryType} query
     * @param {object | null} [exclude]
     * @param {{ expandForEntityExtents?: boolean }} [options]
     * @returns {object[]}
     */
    collectInBounds(bounds, query, exclude = null, { expandForEntityExtents = true } = {}) {
        if (expandForEntityExtents) {
            padAabbInto(this.queryBoundsScratch, bounds, this.maxInsertedExtent + maxNeighborQueryPad());
            return query.collectInIndex(this, this.queryBoundsScratch, exclude);
        }
        return query.collectInIndex(this, bounds, exclude);
    }
    collectNearbyInto(entity, out) {
        out.length = 0;
        this.queryGen++;
        const searchRadius = entityBroadphaseExtent(entity) + this.maxInsertedExtent + neighborQueryPadFor(entity);
        centerReachAabbInto(this.queryBoundsScratch, entity.x, entity.y, searchRadius);
        CURRENT_COLLECT_OUT = out;
        this.forEachInBounds(this.queryBoundsScratch, entity, this.queryGen, COLLECT_NEARBY_PUSH);
        CURRENT_COLLECT_OUT = null;
        return out;
    }
}
/**
 * Estimate travel distance for a rolling body with initial speed v0 under friction damping.
 *
 * @param {number} v0
 * @param {object} strategy
 * @returns {number}
 */
export function estimateRollingTravelDistance(v0, strategy) {
    const fBase = strategy.friction ?? 0.5;
    const fLow = strategy.lowSpeedFriction ?? 2.8;
    const vTh = strategy.lowSpeedFrictionThreshold ?? 10;
    const sC = strategy.snapSpeed ?? 1.8;
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
/**
 * @typedef {object} CircleAimLineTarget
 * @property {number} x
 * @property {number} y
 * @property {number} [radius]
 */
/**
 * Aim arrow segment for a circle shot — stops at the nearest wall or circle target.
 * Same ray model as pool cue-ball preview ({@link castSteppedCircleRay} + {@link rayCircleHitDistance}).
 *
 * @param {{
 *   originX: number,
 *   originY: number,
 *   radius: number,
 *   nx: number,
 *   ny: number,
 *   maxTravelDist: number,
 *   obstacleGrid?: import("../grid/WorldObstacleGrid.js").WorldObstacleGrid | null,
 *   circleTargets?: CircleAimLineTarget[],
 *   maxRayDist?: number,
 * }} options
 * @returns {{ x1: number, y1: number, x2: number, y2: number } | null}
 */
export function computeCircleAimLineSegment({ originX, originY, radius, nx, ny, maxTravelDist, obstacleGrid = null, circleTargets = [], maxRayDist = 2400 }) {
    const len = Math.hypot(nx, ny);
    if (len < 1e-6) return null;
    const dx = nx / len;
    const dy = ny / len;
    const angle = Math.atan2(dy, dx);
    let stopDist = Math.min(maxRayDist, maxTravelDist);
    for (const target of circleTargets) {
        const otherR = target.radius ?? radius;
        const t = rayCircleHitDistance(originX, originY, dx, dy, target.x, target.y, radius + otherR);
        if (t != null && t < stopDist) stopDist = t;
    }
    const wallHit = castSteppedCircleRay(originX, originY, angle, maxRayDist, radius, { obstacleGrid });
    if (wallHit.dist < stopDist) stopDist = wallHit.dist;
    const lead = circleLeadingPoint(originX, originY, radius, dx, dy);
    return { x1: lead.x, y1: lead.y, x2: originX + dx * (stopDist + radius), y2: originY + dy * (stopDist + radius) };
}
// ==========================================
// 1. Ray Circle Hit Distance (from circleCast.js)
// ==========================================
/**
 * Analytic ray vs stationary circle: earliest center distance equal to combined radii.
 *
 * @param {number} ox @param {number} oy
 * @param {number} dx @param {number} dy — unit direction
 * @param {number} cx @param {number} cy
 * @param {number} hitRadius — sum of both circle radii at contact
 * @returns {number | null}
 */
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
export function collectWallSegmentsAlongLine(obstacleGrid, x1, y1, x2, y2, queryRadius) {
    obstacleGrid.resetStaticWallProxyPool();
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const steps = Math.max(2, Math.ceil(len / 8));
    const seen = new Set();
    const result = [];
    const batch = [];
    for (let step = 0; step <= steps; step++) {
        const t = step / steps;
        batch.length = 0;
        obstacleGrid.appendStaticWallProxiesNearWorld(x1 + dx * t, y1 + dy * t, queryRadius, batch);
        for (let i = 0; i < batch.length; i++) {
            const seg = batch[i];
            if (!seen.has(seg)) {
                seen.add(seg);
                result.push(seg);
            }
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
    for (let i = 0; i < candidateWalls.length; i++) {
        const seg = candidateWalls[i];
        if (minDistanceSegmentToWall(x1, y1, x2, y2, seg) <= corridorRadius) return false;
    }
    return true;
}
// ==========================================
// 4. Stepped Circle Ray Cast (from steppedCircleRayCast.js)
// ==========================================
/**
 * First wall segment intersecting a circle (broadphase + precise test).
 * @param {{ x: number, y: number, radius: number }} circle
 * @param {object[]} segments
 * @returns {object | null}
 */
function findFirstCircleSegmentHit(circle, segments) {
    if (!segments || segments.length === 0) return null;
    const radius = circle.radius;
    for (const seg of segments) {
        const dx = circle.x - seg.x;
        const dy = circle.y - seg.y;
        const maxDist = radius + seg.size * 0.75;
        if (Math.abs(dx) > maxDist || Math.abs(dy) > maxDist) continue;
        if (circleIntersectsSegment(circle, seg)) return seg;
    }
    return null;
}
/** @typedef {"wall" | "none" | string} SteppedCircleRayHitKind */
/**
 * @typedef {object} SteppedCircleRayHit
 * @property {SteppedCircleRayHitKind} hit
 * @property {number} x
 * @property {number} y
 * @property {number} dist — center-path distance along the ray at first contact
 * @property {object} [entity]
 */
/**
 * @typedef {object} SteppedCircleRayCircleTarget
 * @property {object} entity
 * @property {number} [radius]
 * @property {string} [hitKind] — returned as `hit` when struck (default `"circle"`)
 */
const DEFAULT_STEP = 8;
function collectCandidateWalls(startX, startY, dx, dy, maxDist, obstacleGrid, queryRadius) {
    if (!obstacleGrid) return [];
    const endX = startX + dx * maxDist;
    const endY = startY + dy * maxDist;
    return collectWallSegmentsAlongLine(obstacleGrid, startX, startY, endX, endY, queryRadius);
}
/**
 * @param {{ x: number, y: number, radius: number }} rayCircle
 * @param {object[]} candidateWalls
 * @returns {boolean}
 */
function rayCircleHitsWall(rayCircle, candidateWalls) {
    return findFirstCircleSegmentHit(rayCircle, candidateWalls) !== null;
}
/**
 * March a circle along a ray in fixed steps; first wall or circle contact wins.
 * Walls back-step to the last free center position; circles use center-distance minus radius.
 *
 * @param {number} startX
 * @param {number} startY
 * @param {number} angle
 * @param {number} maxDist
 * @param {number} radius
 * @param {{
 *   obstacleGrid?: import("../grid/WorldObstacleGrid.js").WorldObstacleGrid | null,
 *   circles?: SteppedCircleRayCircleTarget[],
 *   step?: number,
 * }} [options]
 * @returns {SteppedCircleRayHit}
 */
export function castSteppedCircleRay(startX, startY, angle, maxDist, radius, { obstacleGrid = null, circles = [], step = DEFAULT_STEP, wallQueryRadius = radius } = {}) {
    let dist = 0;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let cx = startX;
    let cy = startY;
    const rayCircle = { x: cx, y: cy, radius };
    const candidateWalls = collectCandidateWalls(startX, startY, dx, dy, maxDist, obstacleGrid, wallQueryRadius);
    while (dist < maxDist) {
        cx += dx * step;
        cy += dy * step;
        dist += step;
        rayCircle.x = cx;
        rayCircle.y = cy;
        if (rayCircleHitsWall(rayCircle, candidateWalls)) {
            let hitWall = true;
            while (hitWall && dist > 0) {
                cx -= dx;
                cy -= dy;
                dist -= 1;
                rayCircle.x = cx;
                rayCircle.y = cy;
                hitWall = rayCircleHitsWall(rayCircle, candidateWalls);
            }
            return { hit: "wall", x: cx, y: cy, dist };
        }
        for (const target of circles) {
            const entity = target.entity;
            const entityRadius = target.radius ?? entity.radius ?? radius;
            if (lengthXY(rayCircle.x - entity.x, rayCircle.y - entity.y) >= rayCircle.radius + entityRadius) continue;
            const distToTarget = Math.hypot(entity.x - startX, entity.y - startY);
            const exactDist = distToTarget - entityRadius;
            return { hit: target.hitKind ?? "circle", entity, x: startX + dx * exactDist, y: startY + dy * exactDist, dist: exactDist };
        }
    }
    return { hit: "none", x: cx, y: cy, dist };
}
let globalGeneration = 0;
export class SpatialQuery {
    constructor() {
        this.generation = 0;
        this._scratch = [];
        this._collectFn = (entity) => {
            this._scratch.push(entity);
        };
    }
    nextQuery() {
        globalGeneration = (globalGeneration + 1) | 0;
        if (globalGeneration === 0) globalGeneration = 1;
        this.generation = globalGeneration;
    }
    /** @param {{ forEachInBounds: Function }} index @param {import("../../Math/Aabb2D.js").Aabb2D} bounds @param {(entity: object) => void} fn @param {object | null} [exclude] */
    forEachInIndex(index, bounds, fn, exclude = null) {
        this.nextQuery();
        index.forEachInBounds(bounds, exclude, this.generation, fn);
    }
    /** @param {{ forEachInBounds: Function }} index @param {import("../../Math/Aabb2D.js").Aabb2D} bounds @param {object | null} [exclude] @returns {object[]} */
    collectInIndex(index, bounds, exclude = null) {
        this._scratch.length = 0;
        this.forEachInIndex(index, bounds, this._collectFn, exclude);
        return this._scratch;
    }
}
const MAX_WALL_BUCKETS = 4096;
const BUCKET_MASK = MAX_WALL_BUCKETS - 1;
const EMPTY_STAMP = -1;
export function wallBucketKeyParts(grid, worldX, worldY, queryRadius) {
    const col = grid.worldCol(worldX);
    const row = grid.worldRow(worldY);
    const pad = 1 + Math.ceil(queryRadius / grid.cellSize);
    return { keyLo: (col & 0xffff) | ((row & 0xffff) << 16), keyHi: pad & 0xff };
}
function bucketSlotForKey(keyLo, keyHi) {
    return (keyLo ^ (keyHi * 0x9e3779b9)) & BUCKET_MASK;
}
function acquireBucketSegments(slab, slot) {
    let segments = slab.segments[slot];
    if (segments) {
        segments.length = 0;
        return segments;
    }
    segments = slab.segmentPool.pop();
    if (!segments) segments = [];
    else segments.length = 0;
    slab.segments[slot] = segments;
    return segments;
}
export function createWallCandidateBucketSlab() {
    const frameStamp = new Int32Array(MAX_WALL_BUCKETS);
    frameStamp.fill(EMPTY_STAMP);
    return {
        keyLo: new Int32Array(MAX_WALL_BUCKETS),
        keyHi: new Int32Array(MAX_WALL_BUCKETS),
        frameStamp,
        revisionStamp: new Int32Array(MAX_WALL_BUCKETS),
        segments: new Array(MAX_WALL_BUCKETS),
        segmentPool: [],
    };
}
export function resetWallCandidateBucketSlab(slab) {
    for (let i = 0; i < MAX_WALL_BUCKETS; i++) {
        if (slab.frameStamp[i] === EMPTY_STAMP) continue;
        const segments = slab.segments[i];
        if (segments) {
            segments.length = 0;
            slab.segmentPool.push(segments);
            slab.segments[i] = null;
        }
        slab.frameStamp[i] = EMPTY_STAMP;
    }
}
export function invalidateWallCandidateBucketFrame(slab) {
    slab.frameStamp.fill(EMPTY_STAMP);
}
export function lookupWallCandidateBucket(slab, keyLo, keyHi, frameId, revision) {
    let slot = bucketSlotForKey(keyLo, keyHi);
    for (let probe = 0; probe < MAX_WALL_BUCKETS; probe++) {
        const idx = (slot + probe) & BUCKET_MASK;
        const stamp = slab.frameStamp[idx];
        if (stamp === EMPTY_STAMP) return { hit: false, slot: idx, segments: acquireBucketSegments(slab, idx) };
        if (slab.keyLo[idx] === keyLo && slab.keyHi[idx] === keyHi) {
            if (stamp === frameId && slab.revisionStamp[idx] === revision) return { hit: true, slot: idx, segments: slab.segments[idx] };
            return { hit: false, slot: idx, segments: acquireBucketSegments(slab, idx) };
        }
    }
    throw new Error(`wall candidate bucket slab full (frame ${frameId}, revision ${revision})`);
}
export function commitWallCandidateBucket(slab, slot, keyLo, keyHi, frameId, revision, segments) {
    slab.keyLo[slot] = keyLo;
    slab.keyHi[slot] = keyHi;
    slab.frameStamp[slot] = frameId;
    slab.revisionStamp[slot] = revision;
    slab.segments[slot] = segments;
}
/** @typedef {{ cells: Set<number> }} GridZoneSubscriptions */
/**
 * @typedef {object} GridZoneEvent
 * @property {"cell"} kind
 * @property {number} key
 * @property {object} entity
 * @property {number} idx
 */
/**
 * @typedef {object} GridZoneHandlers
 * @property {(event: GridZoneEvent) => void} onEnter
 * @property {(event: GridZoneEvent) => void} onOn
 * @property {(event: GridZoneEvent) => void} onExit
 */
/** @param {Set<number>} prev @param {Set<number>} next */
export function diffGridZoneKeys(prev, next) {
    /** @type {number[]} */
    const entered = [];
    /** @type {number[]} */
    const exited = [];
    for (const key of next) if (!prev.has(key)) entered.push(key);
    for (const key of prev) if (!next.has(key)) exited.push(key);
    return { entered, exited };
}
/**
 * @param {object} entity
 * @param {import("../grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {GridZoneSubscriptions} subscriptions
 * @param {Set<number>} out
 */
export function resolveEntityGridZoneKeys(entity, grid, subscriptions, out) {
    out.clear();
    const cellIdx = grid.worldToIdx(entity.x, entity.y);
    if (cellIdx >= 0 && subscriptions.cells.has(cellIdx)) out.add(cellIdx);
}
/**
 * @param {import("../world/SpatialFrameCore.js").SpatialFrameCore} spatialFrame
 * @param {import("../grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {GridZoneSubscriptions} subscriptions
 * @param {GridZoneHandlers} handlers
 */
export function tickGridZoneMembership(spatialFrame, grid, subscriptions, handlers) {
    if (!subscriptions.cells.size) return;
    const kineticBodies = spatialFrame._kineticBodies;
    if (!kineticBodies?.length) return;
    for (let i = 0; i < kineticBodies.length; i++) {
        const entity = kineticBodies[i];
        if (!entity._gridZoneKeys) entity._gridZoneKeys = new Set();
        if (!entity._gridZoneNextKeys) entity._gridZoneNextKeys = new Set();
        const prev = entity._gridZoneKeys;
        const next = entity._gridZoneNextKeys;
        resolveEntityGridZoneKeys(entity, grid, subscriptions, next);
        const { entered, exited } = diffGridZoneKeys(prev, next);
        for (let j = 0; j < entered.length; j++) {
            const key = entered[j];
            handlers.onEnter({ kind: "cell", key, entity, idx: key });
        }
        for (const key of next) handlers.onOn({ kind: "cell", key, entity, idx: key });
        for (let j = 0; j < exited.length; j++) {
            const key = exited[j];
            handlers.onExit({ kind: "cell", key, entity, idx: key });
        }
        entity._gridZoneKeys = next;
        entity._gridZoneNextKeys = prev;
    }
}
/**
 * Packed (col, row) key for sparse unbounded grids.
 *
 * World AABB → cell index range uses minCol/maxCol/minRow/maxRow (see boundsToCellRect).
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
export function unpackCellKey(key) {
    return { col: key % KEY_STRIDE, row: (key / KEY_STRIDE) | 0 };
}
/** @param {number} key from `packEdgeCellKey` */
export function unpackEdgeCellKey(key) {
    const side = (key / EDGE_KEY_STRIDE) | 0;
    const cellKey = key - side * EDGE_KEY_STRIDE;
    return { ...unpackCellKey(cellKey), side: side - 1 };
}
/** @param {number} key */
export function isEdgeZoneKey(key) {
    return key >= EDGE_ZONE_KEY_MIN;
}
export function worldToSparseCellKey(x, y, cellSize) {
    const col = Math.floor(x / cellSize);
    const row = Math.floor(y / cellSize);
    return packCellKey(col, row);
}
export function boundsToCellRect(minX, minY, maxX, maxY, cellSize) {
    return { minCol: Math.floor(minX / cellSize), maxCol: Math.floor(maxX / cellSize), minRow: Math.floor(minY / cellSize), maxRow: Math.floor(maxY / cellSize) };
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
    return {
        startCol: a.startCol < b.startCol ? a.startCol : b.startCol,
        endCol: a.endCol > b.endCol ? a.endCol : b.endCol,
        startRow: a.startRow < b.startRow ? a.startRow : b.startRow,
        endRow: a.endRow > b.endRow ? a.endRow : b.endRow,
    };
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
const ENSURE_AABB = createAabb();
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
export function appendGridEdgeOverlayCommand(out, grid, edge, { stroke, lineWidth = 3, dash = null }) {
    const seg = { x: 0, y: 0 };
    const seg2 = { x: 0, y: 0 };
    cellEdgeEndpointsIdx(grid, edge.idx, edge.side, seg, seg2, 0);
    out.push(overlaySegment(seg.x, seg.y, seg2.x, seg2.y, { stroke, lineWidth, dash: dash ?? undefined }));
}
export function ensureObstacleGridAtWorld(grid, worldX, worldY) {
    centeredAabbInto(ENSURE_AABB, worldX, worldY, grid.cellSize, grid.cellSize);
    grid.expandToCoverAabb(ENSURE_AABB);
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
function beltLinkOk(idxA, kindA, facingA, idxB, kindB, facingB, cols, graph) {
    const { exitSide } = FloorBelt.getEntryExitSides(kindA, facingA);
    const { entrySide } = FloorBelt.getEntryExitSides(kindB, facingB);
    const diff = idxB - idxA;
    let stepSide = -1;
    if (diff === 1 && (idxA + 1) % cols !== 0) stepSide = 1;
    else if (diff === -1 && idxA % cols !== 0) stepSide = 3;
    else if (diff === cols) stepSide = 2;
    else if (diff === -cols) stepSide = 0;
    if (stepSide !== exitSide) return { ok: false, reason: `exit ${exitSide} ≠ step ${stepSide}` };
    const reverseSide = stepSide === 1 ? 3 : stepSide === 3 ? 1 : stepSide === 2 ? 0 : 2;
    if (reverseSide !== entrySide) return { ok: false, reason: `entry ${entrySide} ≠ approach ${reverseSide}` };
    if (!graph.canStepIdx(idxA, idxB)) return { ok: false, reason: `canStep blocked` };
    if (graph.canStepIdx(idxB, idxA)) return { ok: false, reason: `reverse canStep open` };
    return { ok: true };
}
export class BeltPlan {
    constructor() {
        this.cells = new Map();
    }
    get size() {
        return this.cells.size;
    }
    get(idx) {
        return this.cells.get(idx);
    }
    set(idx, kind, facingIndex) {
        this.cells.set(idx, [kind, facingIndex]);
    }
    accumulatePath(path, width, layout) {
        const collapsed = collapsePathRevisits(path, layout);
        const stride = layout.strideCols;
        for (let i = 0; i < collapsed.length; i++) {
            const pIdx = collapsed[i];
            const prevIdx = i > 0 ? collapsed[i - 1] : undefined;
            const nextIdx = i < collapsed.length - 1 ? collapsed[i + 1] : undefined;
            if (prevIdx !== undefined && pIdx === prevIdx) continue;
            const cells = collectCorridorPathPointIndices(pIdx, prevIdx, nextIdx, width, false, i, collapsed.length, layout);
            let spec;
            if (prevIdx !== undefined && nextIdx !== undefined) {
                const entrySide = gridSideFromCellIdxToNeighborIdx(pIdx, prevIdx, stride);
                const exitSide = gridSideFromCellIdxToNeighborIdx(pIdx, nextIdx, stride);
                spec = FloorBelt.resolveKindFromSides(entrySide, exitSide);
            } else if (nextIdx !== undefined) {
                const exitSide = gridSideFromCellIdxToNeighborIdx(pIdx, nextIdx, stride);
                const entrySide = edgeMirrorSide(exitSide);
                spec = FloorBelt.resolveKindFromSides(entrySide, exitSide);
            } else if (prevIdx !== undefined) {
                const entrySide = gridSideFromCellIdxToNeighborIdx(pIdx, prevIdx, stride);
                const exitSide = edgeMirrorSide(entrySide);
                spec = FloorBelt.resolveKindFromSides(entrySide, exitSide);
            } else spec = FloorBelt.resolveKindFromSides(3, 1);
            for (let ci = 0; ci < cells.length; ci++) this.cells.set(cells[ci], [spec.kind, spec.facingIndex]);
        }
    }
    accumulatePaths(paths, widths, layout) {
        for (let pi = 0; pi < paths.length; pi++) this.accumulatePath(paths[pi], widths[pi], layout);
    }
    validate(layout, mouthExteriorIndices = new Set()) {
        const footprint = new Set(this.cells.keys());
        try {
            for (const idx of footprint) if (!this.cells.get(idx)) throw new Error(`belt plan: missing belt at ${formatGlobalCellIdx(idx)}`);
            for (const idx of footprint) {
                const belt = this.cells.get(idx);
                const kind = belt[0];
                const facingIndex = belt[1];
                const { entrySide, exitSide } = FloorBelt.getEntryExitSides(kind, facingIndex);
                const entryIdx = edgeNeighborIdx(idx, entrySide, layout);
                const exitIdx = edgeNeighborIdx(idx, exitSide, layout);
                const entryInFootprint = footprint.has(entryIdx);
                const exitInFootprint = footprint.has(exitIdx);
                if (entryInFootprint) {
                    const entryBelt = this.cells.get(entryIdx);
                    const entryExit = FloorBelt.getEntryExitSides(entryBelt[0], entryBelt[1]).exitSide;
                    if (entryExit !== edgeMirrorSide(entrySide))
                        throw new Error(`belt plan: belt chain break ${formatGlobalCellIdx(entryIdx)} -> ${formatGlobalCellIdx(idx)} (entry side ${entrySide}, upstream exit ${entryExit})`);
                }
                if (exitInFootprint) {
                    const exitBelt = this.cells.get(exitIdx);
                    const exitEntry = FloorBelt.getEntryExitSides(exitBelt[0], exitBelt[1]).entrySide;
                    if (exitEntry !== edgeMirrorSide(exitSide))
                        throw new Error(`belt plan: belt chain break ${formatGlobalCellIdx(idx)} -> ${formatGlobalCellIdx(exitIdx)} (exit side ${exitSide}, downstream entry ${exitEntry})`);
                }
                if (!entryInFootprint && !exitInFootprint && !mouthExteriorIndices.has(idx)) throw new Error(`belt plan: dead-end belt at ${formatGlobalCellIdx(idx)}`);
            }
            return { ok: true, footprint, cells: this.cells, error: null };
        } catch (err) {
            return { ok: false, error: err.message, footprint, cells: this.cells };
        }
    }
    validatePath(graph, cellIndices) {
        if (cellIndices.length < 2) return { ok: true };
        const { grid } = graph;
        const cols = grid.cols;
        for (let i = 0; i < cellIndices.length - 1; i++) {
            const a = cellIndices[i];
            const b = cellIndices[i + 1];
            const specA = this.cells.get(a);
            const kindA = specA ? specA[0] : grid.floorKind[a];
            const facingA = specA ? specA[1] : grid.floorFacing[a];
            const specB = this.cells.get(b);
            const kindB = specB ? specB[0] : grid.floorKind[b];
            const facingB = specB ? specB[1] : grid.floorFacing[b];
            const link = beltLinkOk(a, kindA, facingA, b, kindB, facingB, cols, graph);
            if (!link.ok) return { ok: false, reason: `cell ${i}: ${link.reason}` };
        }
        return { ok: true };
    }
    peel(mouthExteriorIndices, layout) {
        for (let pass = 0; pass < this.cells.size + 4; pass++) {
            const validation = this.validate(layout, mouthExteriorIndices);
            if (validation.ok) return validation;
            const footprint = validation.footprint;
            const byCell = validation.cells;
            const removeIndices = new Set();
            for (const idx of footprint) {
                const belt = byCell.get(idx);
                const kind = belt[0];
                const facingIndex = belt[1];
                const { entrySide, exitSide } = FloorBelt.getEntryExitSides(kind, facingIndex);
                const entryIdx = edgeNeighborIdx(idx, entrySide, layout);
                const exitIdx = edgeNeighborIdx(idx, exitSide, layout);
                const entryInFootprint = footprint.has(entryIdx);
                const exitInFootprint = footprint.has(exitIdx);
                if (!entryInFootprint && !exitInFootprint && !mouthExteriorIndices.has(idx)) removeIndices.add(idx);
                if (entryInFootprint) {
                    const entryBelt = byCell.get(entryIdx);
                    const entryExit = FloorBelt.getEntryExitSides(entryBelt[0], entryBelt[1]).exitSide;
                    if (entryExit !== edgeMirrorSide(entrySide)) removeIndices.add(idx);
                }
                if (exitInFootprint) {
                    const exitBelt = byCell.get(exitIdx);
                    const exitEntry = FloorBelt.getEntryExitSides(exitBelt[0], exitBelt[1]).entrySide;
                    if (exitEntry !== edgeMirrorSide(exitSide)) removeIndices.add(idx);
                }
            }
            if (removeIndices.size === 0) return validation;
            for (const idx of removeIndices) this.cells.delete(idx);
            if (this.cells.size === 0) return this.validate(layout, mouthExteriorIndices);
        }
        return this.validate(layout, mouthExteriorIndices);
    }
    stamp(state) {
        const grid = state.obstacleGrid;
        let bounds = null;
        for (const [idx, spec] of this.cells) {
            if (!grid.writeFloorCell(idx, spec[0], spec[1])) continue;
            if (!bounds) bounds = emptyCellBounds();
            growCellBoundsIdx(bounds, idx, grid);
        }
        if (bounds) FloorBelt.markZoneSubscriptionsDirty(state, bounds);
        return { bounds };
    }
    toRailWalls(heightLevel, thicknessLevel) {
        const batch = new RailWallBatch(Math.max(1, this.cells.size * 2));
        for (const [idx, spec] of this.cells) {
            const sides = FloorBelt.getRailEdgeSides(spec[0], spec[1]);
            for (let s = 0; s < sides.length; s++) batch.add(idx, sides[s], heightLevel, thicknessLevel);
        }
        return batch;
    }
    [Symbol.iterator]() {
        return this.cells[Symbol.iterator]();
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
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
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
        setBoundary(grid, idx, side, { capHeightLevel: heightLevel, thicknessLevel });
        changed = true;
        growCellBoundsIdx(bounds, idx, grid);
    }
    if (!changed) return { bounds: null, stamped: null };
    return { bounds, stamped: railWalls };
}
export function commitGridWallBatch(state, bounds) {
    if (!bounds || isEmptyCellBounds(bounds)) return false;
    const grid = state.obstacleGrid;
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    padCellBoundsInPlace(bounds, grid, 1);
    commitGridNavEdit(state, bounds);
    return true;
}
export function commitGridWallAtIdx(state, idx) {
    const bounds = emptyCellBounds();
    growCellBoundsIdx(bounds, idx, state.obstacleGrid);
    return commitGridWallBatch(state, bounds);
}
export function stampRailWallsBatch(state, railWalls) {
    const { bounds, stamped } = stampRailWallsQuiet(state, railWalls);
    commitGridWallBatch(state, bounds);
    return stamped;
}
export function clearRailWallsBatch(state, rails) {
    const bounds = clearRailWallsQuiet(state, rails);
    commitGridWallBatch(state, bounds);
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
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    return bounds;
}
export function clearVoxelWallsBatch(state, voxelIndices) {
    const bounds = clearVoxelWallsQuiet(state, voxelIndices);
    commitGridWallBatch(state, bounds);
    return bounds;
}
/** Clear voxel and rail walls without nav invalidation — pair with commitGridNavEdit or deferred flush. */
export function clearGridWallsQuiet(state, { voxels = [], rails = [] } = {}) {
    return unionCellBounds(clearVoxelWallsQuiet(state, voxels), clearRailWallsQuiet(state, rails));
}
/** Clear voxel and rail walls in one nav invalidation. */
export function clearGridWallsBatch(state, { voxels = [], rails = [] } = {}) {
    const bounds = clearGridWallsQuiet(state, { voxels, rails });
    commitGridWallBatch(state, bounds);
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
        bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
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
        setBoundary(grid, idx, side, { capHeightLevel: clampStampWallHeightLevel(heightLevel, settings), thicknessLevel });
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
    setBoundary(grid, idx, side, { capHeightLevel: level, thicknessLevel }, true);
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
        placed.push({ idx, heightLevel, label: `Voxel #${index} · height ${heightLevel}` });
    }
    return placed;
}
export function listPlacedRailWalls(grid) {
    /** @type {{ col: number, row: number, side: number, heightLevel: number, thicknessLevel: number, label: string }[]} */
    const placed = [];
    const counts = new Map();
    forEachCellEdge(
        grid,
        (idx, side, edge) => {
            const capLevel = railWallCapLevel(edge, neighborFillLevel(grid, idx, side));
            const key = `${side}:${capLevel}:${edge.thicknessLevel}`;
            const index = (counts.get(key) ?? 0) + 1;
            counts.set(key, index);
            placed.push({ idx, side, heightLevel: capLevel, thicknessLevel: edge.thicknessLevel, label: `Rail #${index} · ${formatGridWallEdgeSideLabel(side)} · height ${capLevel}` });
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
    return { idx, side, heightLevel, thicknessLevel: edge.thicknessLevel, sideLabel: formatGridWallEdgeSideLabel(side) };
}
export function clearPrimaryBoundaryAt(state, idx, side, bumpRevision = false) {
    const grid = state.obstacleGrid;
    if (!boundaryBlocksStep(grid, idx, side)) return false;
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
            if (changed) bumpGridNavEpoch(state.obstacleGrid, GRID_NAV_EPOCH.Wall);
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
            if (changed) bumpGridNavEpoch(state.obstacleGrid, GRID_NAV_EPOCH.Wall);
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
 *
 * @param {object} state
 * @param {number} idx
 * @param {{ invalidateSurfaces?: boolean, fullNavSync?: boolean }} [options]
 */
export function commitGridNavEdit(state, idx, { invalidateSurfaces = true, fullNavSync = false } = {}) {
    const grid = state.obstacleGrid;
    if (!fullNavSync && idx === null) return Promise.resolve();
    if (invalidateSurfaces && state.worldSurfaces)
        if (fullNavSync || idx === null) state.worldSurfaces.invalidateGridBounds({ startCol: 0, endCol: grid.cols - 1, startRow: 0, endRow: grid.rows - 1 }, grid);
        else state.worldSurfaces.invalidateGridBounds(idx, grid);
    if (state.sandbox) FloorBelt.markZoneSubscriptionsDirty(state);
    if (state.editor != null || state.appLaunch != null) rebuildLabMapCaches(state);
    const nav = resolveNavRuntime(state);
    return nav.commitEdit(idx, { fullNavSync });
}
export function commitGridNavEditUnion(state, ...indices) {
    const parts = indices.filter((x) => typeof x === "number");
    if (!parts.length) return Promise.resolve();
    for (let i = 0; i < parts.length; i++) commitGridNavEdit(state, parts[i]);
    return Promise.resolve();
}
export function commitSurfaceMaterialEdit(state, idx) {
    if (state.worldSurfaces) state.worldSurfaces.invalidateGridBounds(idx, state.obstacleGrid);
    if (state.sandbox) FloorBelt.markZoneSubscriptionsDirty(state);
    if (state.editor != null || state.appLaunch != null) rebuildLabMapCaches(state);
    return idx;
}
export function setChunkSurfaceProfileEdit(state, cellBounds, profileId) {
    const cellsPerChunk = state.worldSurfaces.settings.cellsPerChunk;
    state.obstacleGrid.setChunkSurfaceProfileForCellBounds(cellBounds, profileId, cellsPerChunk);
    commitSurfaceMaterialEdit(state, null);
    return cellBounds;
}
export function clearChunkSurfaceProfileEdit(state, cellBounds) {
    const cellsPerChunk = state.worldSurfaces.settings.cellsPerChunk;
    forEachChunkKeyInCellBounds(cellBounds, cellsPerChunk, (key) => state.obstacleGrid.clearChunkSurfaceProfileAtKey(key, cellsPerChunk));
    commitSurfaceMaterialEdit(state, null);
    return cellBounds;
}
/** Stamp or replace one floor cell and resync nav topology. */
export function applyFloorCellEdit(state, idx, kind, facingIndex) {
    if (!state.obstacleGrid.writeFloorCell(idx, kind, facingIndex)) return null;
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
export function fillRandomBuffer(strideCols, cellCount, fillChance, out) {
    return fillRandomGrid(strideCols, cellCount / strideCols, fillChance, out);
}
export function runCellularAutomataBuffer(strideCols, cellCount, cells, options) {
    return runCellularAutomata(strideCols, cellCount / strideCols, cells, options);
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
                components.push({ touchesSouth, sample: members[0] });
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
    let cells = fillRandomBuffer(strideCols, cellCount, config.fillChance);
    cells = runCellularAutomataBuffer(strideCols, cellCount, cells, { iterations: config.iterations, scratch: new Uint8Array(cellCount) });
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
const RAIL_MAZE_FULL_FOOTPRINT = { interiorOnly: false };
const DEFAULT_CORRIDOR_COUNT = 150;
const DEFAULT_PATH_LENGTH_MIN = 6;
const DEFAULT_PATH_LENGTH_MAX = 24;
const MAX_PAIR_ATTEMPTS_PER_CORRIDOR = 96;
const BELT_PLAN_SEED_SALT = 0xbe1a5afe;
function pathLengthInBand(path, minLen, maxLen) {
    return path.length >= minLen && path.length <= maxLen;
}
function navWalkableNeighborsIdx(grid, navTopology, idx) {
    const out = [];
    forEachCardinalNeighborIdx(idx, grid, (nIdx) => {
        if (grid.canStep(idx, nIdx, navTopology) || grid.canStep(nIdx, idx, navTopology)) out.push(nIdx);
    });
    return out;
}
export function collectRailMazeBeltZoneCells(grid, navTopology, railConfig, navWalkableIndex) {
    const rowOffset = Math.round(grid.minY / grid.cellSize);
    const beltStartRow = ((railConfig.boundsIdx / grid.cols) | 0) + rowOffset;
    const cells = [];
    forEachGlobalCellInMapGenBounds(grid, railConfig, (idx) => {
        const row = (idx / grid.cols) | 0;
        if (row + rowOffset < beltStartRow) return;
        if (idx < 0 || idx >= navWalkableIndex.flags.length || navWalkableIndex.flags[idx] === 0) return;
        cells.push(idx);
    });
    return cells;
}
function degreeInZone(cells, neighborAtIdx) {
    const memberSet = new Set(cells);
    const degreeByIndex = new Map();
    for (let i = 0; i < cells.length; i++) {
        const idx = cells[i];
        const neighbors = neighborAtIdx(idx).filter((nIdx) => memberSet.has(nIdx));
        degreeByIndex.set(idx, neighbors.length);
    }
    return degreeByIndex;
}
function pickRandomFreeIdx(freeIndices, occupiedGlobalIndices, rng) {
    if (freeIndices.length < 2) return -1;
    for (let attempt = 0; attempt < freeIndices.length; attempt++) {
        const idx = freeIndices[Math.floor(rng() * freeIndices.length)];
        if (!occupiedGlobalIndices.has(idx)) return idx;
    }
    return -1;
}
function pickRandomEndInLengthBandIdx(startIdx, endpointIndices, occupiedGlobalIndices, layoutCols, minLen, maxLen, rng) {
    const candidates = [];
    for (let i = 0; i < endpointIndices.length; i++) {
        const idx = endpointIndices[i];
        if (idx === startIdx) continue;
        if (occupiedGlobalIndices.has(idx)) continue;
        const dist = manhattanDistanceIdx(startIdx, idx, layoutCols);
        if (dist < minLen || dist > maxLen) continue;
        candidates.push(idx);
    }
    if (!candidates.length) return pickRandomFreeIdx(endpointIndices, occupiedGlobalIndices, rng);
    return candidates[Math.floor(rng() * candidates.length)];
}
export class CorridorBeltSession {
    constructor(grid, navTopology, railConfig, navWalkableIndex) {
        this.grid = grid;
        this.navTopology = navTopology;
        this.railConfig = railConfig;
        this.layout = gridCellLayout(grid);
        this.pathfinder = new CorridorPathfinder(grid, navTopology, railConfig, navWalkableIndex);
        this.zoneCells = collectRailMazeBeltZoneCells(grid, navTopology, railConfig, navWalkableIndex);
    }
    plan({ corridorCount = DEFAULT_CORRIDOR_COUNT, corridorWidth = 1, pathLengthMin = DEFAULT_PATH_LENGTH_MIN, pathLengthMax = DEFAULT_PATH_LENGTH_MAX, mapSeed = 0, rng = null } = {}) {
        const random = rng ?? createSeededRng((mapSeed ^ BELT_PLAN_SEED_SALT) >>> 0);
        const cols = this.grid.cols;
        const endpointIndices = filterNavBeltEndpointCandidatesIdx(this.grid, this.navTopology, this.zoneCells);
        const occupiedGlobalIndices = new Set();
        const paths = [];
        const widths = [];
        for (let placed = 0; placed < corridorCount; placed++) {
            let placedPath = null;
            for (let attempt = 0; attempt < MAX_PAIR_ATTEMPTS_PER_CORRIDOR; attempt++) {
                const startIdx = pickRandomFreeIdx(endpointIndices, occupiedGlobalIndices, random);
                if (startIdx === -1) break;
                const endIdx = pickRandomEndInLengthBandIdx(startIdx, endpointIndices, occupiedGlobalIndices, cols, pathLengthMin, pathLengthMax, random);
                if (endIdx === -1) break;
                if (startIdx === endIdx) continue;
                const path = this.pathfinder.findCorridorPath(startIdx, endIdx, occupiedGlobalIndices, corridorWidth, pathLengthMax);
                if (!path) continue;
                if (!pathLengthInBand(path, pathLengthMin, pathLengthMax)) continue;
                if (!validateBeltPathMouthAccess(this.grid, this.navTopology, path, occupiedGlobalIndices)) continue;
                placedPath = path;
                break;
            }
            if (!placedPath) break;
            paths.push(placedPath);
            widths.push(corridorWidth);
            addCorridorPathToOccupied(placedPath, occupiedGlobalIndices, corridorWidth, this.layout, RAIL_MAZE_FULL_FOOTPRINT);
        }
        const beltPlan = new BeltPlan();
        beltPlan.accumulatePaths(paths, widths, this.layout);
        const mouthExteriorIndices = new Set(collectPathMouthExteriorIndices(paths, this.grid));
        const validation = beltPlan.peel(mouthExteriorIndices, this.layout);
        const heightLevel = this.railConfig.wallHeightLevel ?? 1;
        const thicknessLevel = this.railConfig.edgeThickness ?? 1;
        const beltRails = beltPlan.toRailWalls(heightLevel, thicknessLevel);
        const neighborAtIdx = (idx) => navWalkableNeighborsIdx(this.grid, this.navTopology, idx);
        const degreeByIndex = degreeInZone(this.zoneCells, neighborAtIdx);
        return { beltPlan, paths, beltRails, validation, degreeByIndex, mouthExteriorIndices, pathCount: paths.length, zoneCellCount: this.zoneCells.length };
    }
}
export function hasOpenBeltMouthSideIdx(grid, navTopology, idx) {
    if (grid.isBlockedIdx(idx)) return false;
    const navGraph = createNavGraphViewFromTopology(navTopology);
    let open = false;
    forEachCardinalNeighborIdx(idx, grid, (nIdx) => {
        if (open) return;
        if (!grid.isBlockedIdx(nIdx) && navGraph.canStepIdx(nIdx, idx) && navGraph.canStepIdx(idx, nIdx)) open = true;
    });
    return open;
}
export function filterNavBeltEndpointCandidatesIdx(grid, navTopology, cellIndices) {
    const out = [];
    for (let i = 0; i < cellIndices.length; i++) {
        const idx = cellIndices[i];
        if (hasOpenBeltMouthSideIdx(grid, navTopology, idx)) out.push(idx);
    }
    return out;
}
export function beltPathMouthExteriorCells(path, grid) {
    const cols = grid.cols;
    const startIdx = path[0];
    const secondIdx = path[1];
    const endIdx = path[path.length - 1];
    const prevIdx = path[path.length - 2];
    const startEntrySide = gridSideFromCellIdxToNeighborIdx(secondIdx, startIdx, cols);
    const entryExteriorIdx = edgeNeighborIdx(startIdx, startEntrySide, grid);
    const endExitSide = gridSideFromCellIdxToNeighborIdx(prevIdx, endIdx, cols);
    const exitExteriorIdx = edgeNeighborIdx(endIdx, endExitSide, grid);
    return { entryExteriorIdx, exitExteriorIdx };
}
export function validateBeltPathMouthAccess(grid, navTopology, path, occupiedGlobalIndices = new Set()) {
    if (path.length < 2) return false;
    const startIdx = path[0];
    const endIdx = path[path.length - 1];
    const { entryExteriorIdx, exitExteriorIdx } = beltPathMouthExteriorCells(path, grid);
    if (entryExteriorIdx === -1 || exitExteriorIdx === -1) return false;
    if (grid.isBlockedIdx(entryExteriorIdx)) return false;
    if (grid.isBlockedIdx(exitExteriorIdx)) return false;
    if (occupiedGlobalIndices.has(entryExteriorIdx)) return false;
    if (occupiedGlobalIndices.has(exitExteriorIdx)) return false;
    const navGraph = createNavGraphViewFromTopology(navTopology);
    if (!navGraph.canStepIdx(entryExteriorIdx, startIdx)) return false;
    if (!navGraph.canStepIdx(endIdx, exitExteriorIdx)) return false;
    return true;
}
export function collectPathMouthExteriorIndices(paths, grid) {
    const mouths = new Set();
    for (let i = 0; i < paths.length; i++) {
        const path = paths[i];
        if (path.length < 2) continue;
        const startIdx = path[0];
        const endIdx = path[path.length - 1];
        mouths.add(startIdx);
        mouths.add(endIdx);
        const { entryExteriorIdx, exitExteriorIdx } = beltPathMouthExteriorCells(path, grid);
        if (entryExteriorIdx !== -1) mouths.add(entryExteriorIdx);
        if (exitExteriorIdx !== -1) mouths.add(exitExteriorIdx);
    }
    return mouths;
}
export function stampGlobalRailWalls(state, rails, { commit = true } = {}) {
    const result = stampRailWallsQuiet(state, rails);
    if (!commit || !result.bounds) return result;
    commitGridNavEdit(state, result.bounds);
    return result;
}
export const MAP_GEN_KINDS = ["cavern", "rail", "railMaze", "erase"];
export const MAP_GEN_OVERLAY_COLORS = { cavern: "#ff9800", rail: "#e040fb", railMaze: "#ba68c8", erase: "#f44336" };
export function createDefaultMapGenBoundsConfig() {
    return { boundsMode: "rect", boundsIdx: 0, boundsCols: 32, boundsRows: 32, centerIdx: 0, outerRadiusCells: 16, donutThicknessCells: 4 };
}
export function createMapGenBoundsAabbCache() {
    return { aabb: createAabb(), boundsMode: "", boundsIdx: -1, boundsCols: NaN, boundsRows: NaN, centerIdx: -1, outerRadiusCells: NaN, donutThicknessCells: NaN };
}
export function getInnerRadiusCells(config) {
    if (config.boundsMode !== "donut") return 0;
    return Math.max(0, config.outerRadiusCells - config.donutThicknessCells);
}
export function getMapGenBoundsAabbInto(grid, out, config) {
    const cellSize = grid.cellSize;
    if (config.boundsMode === "rect") {
        const minX = grid.gridCenterXByIdx(config.boundsIdx) - cellSize * 0.5;
        const minY = grid.gridCenterYByIdx(config.boundsIdx) - cellSize * 0.5;
        return minCornerAabbInto(out, minX, minY, config.boundsCols * cellSize, config.boundsRows * cellSize);
    }
    const r = Math.max(1, config.outerRadiusCells) * cellSize;
    const cx = grid.gridCenterXByIdx(config.centerIdx);
    const cy = grid.gridCenterYByIdx(config.centerIdx);
    return minCornerAabbInto(out, cx - r, cy - r, r * 2, r * 2);
}
export function getMapGenBoundsAabb(grid, config) {
    return getMapGenBoundsAabbInto(grid, createAabb(), config);
}
export function getMapGenBoundsCenterWorld(grid, config) {
    const cellSize = grid.cellSize;
    if (config.boundsMode === "rect")
        return { x: grid.gridCenterXByIdx(config.boundsIdx) + (config.boundsCols - 1) * cellSize * 0.5, y: grid.gridCenterYByIdx(config.boundsIdx) + (config.boundsRows - 1) * cellSize * 0.5 };
    return { x: grid.gridCenterXByIdx(config.centerIdx), y: grid.gridCenterYByIdx(config.centerIdx) };
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
    return (
        cache.boundsMode === config.boundsMode &&
        cache.boundsIdx === config.boundsIdx &&
        cache.boundsCols === config.boundsCols &&
        cache.boundsRows === config.boundsRows &&
        cache.centerIdx === config.centerIdx &&
        cache.outerRadiusCells === config.outerRadiusCells &&
        cache.donutThicknessCells === config.donutThicknessCells
    );
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
    getMapGenBoundsAabbInto(grid, cache.aabb, config);
}
export function getMapGenBoundsConfig(editor, kind) {
    if (kind === "cavern") return editor.cavernConfig;
    if (kind === "rail") return editor.railConfig;
    if (kind === "railMaze") return editor.railMazeConfig;
    return editor.eraseConfig;
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
        }
    };
}
const MAP_GEN_CLEAR_CIRCLE_BOUNDS = createAabb();
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
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    return bounds;
}
function stampCellBoundsForConfig(grid, config) {
    return cellBoundsFromStampLayout(stampLayoutFromConfig(grid, config));
}
function clearStaticWallsInWorldCircle(state, centerWorldX, centerWorldY, radiusWorld) {
    const grid = state.obstacleGrid;
    centerReachAabbInto(MAP_GEN_CLEAR_CIRCLE_BOUNDS, centerWorldX, centerWorldY, radiusWorld);
    const bounds = emptyCellBounds();
    forEachObstacleGridCellInAabb(grid, MAP_GEN_CLEAR_CIRCLE_BOUNDS, (idx) => {
        const cellBounds = grid.getCellBoundsByIdx(idx);
        const cx = (cellBounds.minX + cellBounds.maxX) * 0.5;
        const cy = (cellBounds.minY + cellBounds.maxY) * 0.5;
        if (Math.hypot(cx - centerWorldX, cy - centerWorldY) >= radiusWorld) return;
        if (!clearStaticWallsAndEdgesAtIdx(grid, idx)) return;
        growCellBoundsIdx(bounds, idx, grid);
    });
    if (isEmptyCellBounds(bounds)) return null;
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
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
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    return bounds;
}
function mergeDonutInnerClear(state, config, damageBounds) {
    if (config.boundsMode !== "donut") return damageBounds;
    const grid = state.obstacleGrid;
    const cellSize = grid.cellSize;
    const center = getMapGenBoundsCenterWorld(grid, config);
    const cleared = clearStaticWallsInWorldCircle(state, center.x, center.y, getInnerRadiusCells(config) * cellSize);
    return cleared ? unionCellBounds(damageBounds, cleared) : damageBounds;
}
export function applyMapGenSurfaceProfile(state, config, profileId) {
    const grid = state.obstacleGrid;
    const cellsPerChunk = state.worldSurfaces.settings.cellsPerChunk;
    grid.setChunkSurfaceProfileForCellBounds(cellBoundsFromStampLayout(stampLayoutFromConfig(grid, config)), profileId, cellsPerChunk);
    grid.surfaceMaterialRevision++;
}
export function applyEditorRegionSurfaceProfiles(state) {
    const grid = state.obstacleGrid;
    const cellsPerChunk = state.worldSurfaces.settings.cellsPerChunk;
    grid.surfaceMaterials.chunkProfileIds.clear();
    grid.surfaceMaterialRevision++;
    const profiles = [
        [state.editor.cavernConfig, "tomatoGarden"],
        [state.editor.railConfig, "poolTableFelt"],
        [state.editor.railMazeConfig, "cyberGrid"],
    ];
    for (let i = 0; i < profiles.length; i++) {
        const config = profiles[i][0];
        const fallback = profiles[i][1];
        grid.setChunkSurfaceProfileForCellBounds(cellBoundsFromStampLayout(stampLayoutFromConfig(grid, config)), config.surfaceProfileId || fallback, cellsPerChunk);
    }
}
async function finalizeMapGenRun(state, { config, profileId, damageBounds, fullNavSync = true, syncFloorSeed = true } = {}) {
    if (profileId != null) applyMapGenSurfaceProfile(state, config, profileId);
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
        cells = fillRandomBuffer(edgeStride, edgeCount, config.fillChance);
        cells = runCellularAutomataBuffer(edgeStride, edgeCount, cells, { iterations: config.iterations, scratch: new Uint8Array(edgeCount) });
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
        if (lr < rows && idxBelow >= 0 && idxBelow < grid.grid.length) setBoundary(grid, idxBelow, 0, { kind: "railWall", capHeightLevel: heightLevel, thicknessLevel });
        else if (lr > 0) {
            const idxAbove = stampGlobalIdx(originIdx, (lr - 1) * cols + lc, layoutCols, cols);
            if (idxAbove >= 0 && idxAbove < grid.grid.length) setBoundary(grid, idxAbove, 2, { kind: "railWall", capHeightLevel: heightLevel, thicknessLevel });
        }
    }
    for (let edgeIdx = 0; edgeIdx < v.edgeCount; edgeIdx++) {
        if (v.cells[edgeIdx] !== 1) continue;
        const lr = (edgeIdx / v.edgeStride) | 0;
        const lc = edgeIdx % v.edgeStride;
        const idxRight = stampGlobalIdx(originIdx, lr * cols + lc, layoutCols, cols);
        if (lc < cols && idxRight >= 0 && idxRight < grid.grid.length) setBoundary(grid, idxRight, 3, { kind: "railWall", capHeightLevel: heightLevel, thicknessLevel });
        else if (lc > 0) {
            const idxLeft = stampGlobalIdx(originIdx, lr * cols + lc - 1, layoutCols, cols);
            if (idxLeft >= 0 && idxLeft < grid.grid.length) setBoundary(grid, idxLeft, 1, { kind: "railWall", capHeightLevel: heightLevel, thicknessLevel });
        }
    }
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    return bounds;
}
function createMapGenRun(state) {
    const grid = state.obstacleGrid;
    return {
        ensureCoverage(extraAabb) {
            return ensureLabObstacleGridCoverage(state, extraAabb);
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
    }
    ensureLabObstacleGridCoverage(state);
    applyEditorRegionSurfaceProfiles(state);
    await commitGridNavEdit(state, null, { fullNavSync: true });
}
export function ensureLabObstacleGridCoverage(state, extraAabb = null) {
    const grid = state.obstacleGrid;
    const cellSize = grid.cellSize;
    const { editor } = state;
    let required = getMapGenBoundsAabb(grid, editor.cavernConfig);
    required = unionAabb(required, getMapGenBoundsAabb(grid, editor.railConfig));
    required = unionAabb(required, getMapGenBoundsAabb(grid, editor.railMazeConfig));
    required = unionAabb(required, getMapGenBoundsAabb(grid, editor.eraseConfig));
    if (extraAabb) required = unionAabb(required, extraAabb);
    return grid.expandToCoverAabb(padAabb(required, cellSize));
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
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    let damageBounds = run.mergeDonut(config, bounds);
    await commitGridNavEdit(state, damageBounds);
    stampRailMazeBeltsPhase(state, config, options);
    await run.finish(config, config.surfaceProfileId || "cyberGrid", null, { fullNavSync: true });
}
function writeKineticBodySlabSnapshot(prop) {
    writeStaticKineticSlabSlot(prop);
    writeActiveKineticBodySlabPose(prop);
    writeBroadphaseFromBounds(prop._physId, getBroadphaseBounds(prop));
}
export class KineticSpatialFrame extends SpatialFrameCore {
    constructor(cellSize = 50) {
        super(cellSize);
        /** Every kinetic body in the sim (sleeping + awake) — occupancy, sleep eval. */
        this._kineticBodies = [];
        /** Awake kinetic bodies only — reindex, pair loop, wall resolve substeps. */
        this._activeKineticBodies = [];
        /** Registry membershipGen when this frame was last populated. */
        this.populatedMembershipGen = 0;
        this._nextPhysId = 0;
        this._activationScheduled = new Set();
        this._patchPrimarySeen = new Uint8Array(MAX_ENTITIES);
        this._patchPrimarySeenIds = new Int32Array(MAX_ENTITIES);
    }
    begin(state) {
        this.resetFrame(state.obstacleGrid);
        this._kineticBodies.length = 0;
        let physIdCounter = 0;
        const worldProps = state.worldProps;
        for (let i = 0; i < worldProps.length; i++) {
            const prop = worldProps[i];
            prop.ax = 0;
            prop.ay = 0;
            this.insertEntity(prop, physIdCounter++);
            if (prop.strategy?.isKinetic) {
                this._kineticBodies.push(prop);
                writeKineticBodySlabSnapshot(prop);
            }
        }
        this._nextPhysId = physIdCounter;
        this.syncActiveKineticBodies();
        this.populatedMembershipGen = state.entityRegistry.membershipGen;
        return this;
    }
    /**
     * Insert or re-insert a kinetic prop after mid-tick spawn or geometry change.
     * Keeps broadphase, neighbor queries, and registry view gen in sync for the rest of the frame.
     */
    admitKineticProp(prop, world) {
        if (!prop) return;
        const isNew = prop._physId === undefined;
        if (isNew) {
            prop._physId = this._nextPhysId++;
            if (prop._physId >= MAX_ENTITIES) throw new Error(`PhysId limit exceeded: ${prop._physId} >= ${MAX_ENTITIES}`);
            this._kineticBodies.push(prop);
        } else this.entityGrid.remove(prop);
        this.entityGrid.insert(prop);
        prop._neighborsFrameId = -1;
        this.frameId = (this.frameId + 1) | 0;
        if (prop.strategy?.isKinetic) {
            this.activateKineticBody(prop);
            writeKineticBodySlabSnapshot(prop);
        }
        this.populatedMembershipGen = world.entityRegistry.membershipGen;
        bumpKineticTopologyGeneration(world.kinetic);
    }
    /**
     * Batch admit multiple props.
     */
    admitKineticProps(props, world) {
        let anyAdmitted = false;
        for (let i = 0; i < props.length; i++) {
            const prop = props[i];
            if (!prop) continue;
            const isNew = prop._physId === undefined;
            if (isNew) {
                prop._physId = this._nextPhysId++;
                if (prop._physId >= MAX_ENTITIES) throw new Error(`PhysId limit exceeded: ${prop._physId} >= ${MAX_ENTITIES}`);
                this._kineticBodies.push(prop);
            } else this.entityGrid.remove(prop);
            this.entityGrid.insert(prop);
            prop._neighborsFrameId = -1;
            if (prop.strategy?.isKinetic) {
                this.activateKineticBody(prop);
                writeKineticBodySlabSnapshot(prop);
            }
            anyAdmitted = true;
        }
        if (anyAdmitted) {
            this.frameId = (this.frameId + 1) | 0;
            this.populatedMembershipGen = world.entityRegistry.membershipGen;
            bumpKineticTopologyGeneration(world.kinetic);
        }
    }
    getWallCandidates(entity) {
        if (entity._physId !== undefined && entity._physId !== -1) {
            if (!this._obstacleGrid) return [];
            const slabX = kineticDynamicSlab.x[entity._physId];
            const slabY = kineticDynamicSlab.y[entity._physId];
            return this._wallCandidatesNearWorld(slabX, slabY, entityBroadphaseExtent(entity));
        }
        return super.getWallCandidates(entity);
    }
    syncActiveKineticBodies() {
        const active = this._activeKineticBodies;
        active.length = 0;
        clearActiveKineticBodySlab();
        const all = this._kineticBodies;
        for (let i = 0; i < all.length; i++) {
            const prop = all[i];
            if (prop._physId === undefined) {
                prop._activeSlot = -1;
                continue;
            }
            if (!prop.isSleeping) {
                prop._activeSlot = active.length;
                active.push(prop);
                appendActiveKineticBodySlabPhysId(prop._physId);
            } else prop._activeSlot = -1;
        }
    }
    _ensureActive(prop) {
        if (prop._physId === undefined) return;
        const active = this._activeKineticBodies;
        if (prop._activeSlot >= 0 && active[prop._activeSlot] === prop) return;
        prop._activeSlot = active.length;
        active.push(prop);
        appendActiveKineticBodySlabPhysId(prop._physId);
        writeKineticBodySlabSnapshot(prop);
    }
    _removeFromActive(prop) {
        const slot = prop._activeSlot;
        if (slot == null || slot < 0) return;
        const active = this._activeKineticBodies;
        if (slot >= active.length || active[slot] !== prop) return;
        const last = active.pop();
        if (last && last !== prop) {
            active[slot] = last;
            last._activeSlot = slot;
            kineticDynamicSlab.activePhysIds[slot] = last._physId;
            kineticDynamicSlab.activeSlot[last._physId] = slot;
        }
        prop._activeSlot = -1;
        kineticDynamicSlab.activeSlot[prop._physId] = -1;
        kineticDynamicSlab.activePhysCount = active.length;
    }
    scheduleKineticActivation(prop) {
        if (prop._physId === undefined) return;
        wakeKineticBody(prop);
        this._activationScheduled.add(prop);
    }
    _wakeConstraintLinkedPeers(prop, patchOut) {
        const linked = prop._kineticLinkNeighbors;
        if (linked?.length) {
            for (let i = 0; i < linked.length; i++) {
                const peer = linked[i];
                if (peer === prop || peer._physId === undefined) continue;
                if (peer.isSleeping) wakeKineticBody(peer);
                this._ensureActive(peer);
                if (patchOut) patchOut.push(peer);
            }
            return;
        }
        const peers = prop._kineticIslandPeers;
        if (!peers) return;
        for (let i = 0; i < peers.length; i++) {
            const peer = peers[i];
            if (peer === prop || peer._physId === undefined) continue;
            if (peer.isSleeping) wakeKineticBody(peer);
            this._ensureActive(peer);
            if (patchOut) patchOut.push(peer);
        }
    }
    flushScheduledKineticActivations(patchOut) {
        const scheduled = this._activationScheduled;
        if (scheduled.size === 0) return;
        for (const prop of scheduled) {
            this._ensureActive(prop);
            this._wakeConstraintLinkedPeers(prop, patchOut);
            if (patchOut) patchOut.push(prop);
        }
        scheduled.clear();
    }
    activateKineticBody(prop) {
        if (prop._physId === undefined) return;
        if (prop.isSleeping) wakeKineticBody(prop);
        this._ensureActive(prop);
        this._wakeConstraintLinkedPeers(prop);
    }
    reindexKineticBodies(bodies) {
        if (!bodies?.length) return;
        for (let i = bodies.length - 1; i >= 0; i--) if (bodies[i]._physId === undefined) bodies.splice(i, 1);
        if (!bodies.length) return;
        super.reindexKineticBodies(bodies);
    }
    evictKineticProp(prop, session) {
        if (!prop || prop._physId === undefined) return;
        const physId = prop._physId;
        prop.x = kineticDynamicSlab.x[physId];
        prop.y = kineticDynamicSlab.y[physId];
        prop.vx = kineticDynamicSlab.vx[physId];
        prop.vy = kineticDynamicSlab.vy[physId];
        prop.angularVelocity = kineticDynamicSlab.w[physId];
        kineticDynamicSlab.islandRoot[physId] = -1;
        this.entityGrid.remove(prop);
        const all = this._kineticBodies;
        for (let i = all.length - 1; i >= 0; i--) if (all[i] === prop) all.splice(i, 1);
        this._removeFromActive(prop);
        this._activationScheduled.delete(prop);
        delete prop._physId;
        prop._neighborsFrameId = -1;
        if (prop._neighbors) prop._neighbors.length = 0;
        this.frameId = (this.frameId + 1) | 0;
        if (session) bumpKineticTopologyGeneration(session);
    }
}
/** Shared frame for simulation ticks. Call begin() once per update. */
export const kineticSpatial = new KineticSpatialFrame(50);
