import { EntityGrid } from "../indexes/EntityGrid.js";
import { entityBroadphaseExtent, kineticNeighborQueryPad } from "../collision/entityBroadphase.js";
import { SpatialQuery } from "../query/SpatialQuery.js";
import { centerReachAabbInto, createAabb } from "../../Math/Aabb2D.js";
/** @typedef {import("../../Math/Aabb2D.js").Aabb2D} Aabb2D */
const NEAR_QUERY_BOUNDS = createAabb();
const EMPTY_WALL_CANDIDATES = [];
/** @typedef {import("../query/wallContext.js").WallContext} WallContext */
function wallBucketKey(grid, worldX, worldY, queryRadius) {
    const { col, row } = grid.worldToGrid(worldX, worldY);
    const pad = 1 + Math.ceil(queryRadius / grid.cellSize);
    return (col & 0xffff) | ((row & 0xffff) << 16) | ((pad & 0xff) << 32);
}
function collectWallSegmentsNearWorld(wallCtx, worldX, worldY, queryRadius, out) {
    wallCtx.obstacleGrid.appendStaticWallProxiesNearWorld(worldX, worldY, queryRadius, out);
}
/**
 * Duck-typed per-tick spatial frame: entity grid, neighbor cache, wall segment cache.
 * Game adapters call resetFrame / insertEntity / setWallContext then run pair policies.
 */
export class SpatialFrameCore {
    constructor(cellSize = 50) {
        this.entityGrid = new EntityGrid(cellSize);
        this.wallQuery = new SpatialQuery();
        this.frameId = 0;
        this._wallBucketCache = new Map();
        this._wallBucketRevision = -1;
        /** @type {WallContext | null} */
        this._wallContext = null;
    }
    /** @param {(import("../Math/Aabb2D.js").Aabb2D & { cols: number, cellSize: number, resetStaticWallProxyPool?: () => void, wallGridRevision?: number }) | null} obstacleGrid */
    resetFrame(obstacleGrid) {
        this.frameId = (this.frameId + 1) | 0;
        this._wallBucketCache.clear();
        this._wallBucketRevision = -1;
        obstacleGrid?.resetStaticWallProxyPool?.();
        this.entityGrid.syncBounds(obstacleGrid);
        this.entityGrid.clear();
    }
    /** @returns {WallContext | null} */
    getWallContext() {
        return this._wallContext;
    }
    _ensureWallBucketCacheRevision(grid) {
        const revision = grid.wallGridRevision ?? 0;
        if (this._wallBucketRevision === revision) return;
        this._wallBucketCache.clear();
        grid.resetStaticWallProxyPool?.();
        this._wallBucketRevision = revision;
    }
    _wallCandidatesNearWorld(worldX, worldY, queryRadius) {
        const wallCtx = this._wallContext;
        const grid = wallCtx?.obstacleGrid;
        if (!grid) return EMPTY_WALL_CANDIDATES;
        this._ensureWallBucketCacheRevision(grid);
        const key = wallBucketKey(grid, worldX, worldY, queryRadius);
        const cached = this._wallBucketCache.get(key);
        if (cached) return cached;
        const segments = [];
        collectWallSegmentsNearWorld(wallCtx, worldX, worldY, queryRadius, segments);
        this._wallBucketCache.set(key, segments);
        return segments;
    }
    /** @param {WallContext | null} wallContext */
    setWallContext(wallContext) {
        this._wallContext = wallContext;
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
     * Bumps frameId so neighbor queries see new poses; wall bucket cache is keyed by position.
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
    }
    getWallCandidates(entity) {
        return this._wallCandidatesNearWorld(entity.x, entity.y, entityBroadphaseExtent(entity));
    }
    getNeighbors(entity) {
        if (entity._neighborsFrameId === this.frameId) return entity._neighbors;
        if (!entity._neighbors) entity._neighbors = [];
        else entity._neighbors.length = 0;
        const res = this.entityGrid.collectNearby(entity);
        for (let i = 0; i < res.length; i++) entity._neighbors.push(res[i]);
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
     * @param {{ x: number, y: number, getShape?: () => import("../collision/Shapes.js").Shape }} anchor
     * @param {object | null} [exclude]
     * @returns {object[]}
     */
    collectEntitiesNear(anchor, exclude = null) {
        const searchRadius = entityBroadphaseExtent(anchor) + this.entityGrid.maxInsertedExtent + kineticNeighborQueryPad();
        centerReachAabbInto(NEAR_QUERY_BOUNDS, anchor.x, anchor.y, searchRadius);
        return this.entityGrid.collectInBounds(NEAR_QUERY_BOUNDS, this.wallQuery, exclude, { expandForEntityExtents: false });
    }
}
