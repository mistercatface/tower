import { EntityGrid } from "../indexes/EntityGrid.js";
import { entityBroadphaseExtent, neighborQueryPadFor } from "../collision/entityBroadphase.js";
import { SpatialQuery } from "../query/SpatialQuery.js";
import { centerReachAabbInto, createAabb } from "../../Math/Aabb2D.js";
import {
    commitWallCandidateBucket,
    createWallCandidateBucketSlab,
    invalidateWallCandidateBucketFrame,
    lookupWallCandidateBucket,
    resetWallCandidateBucketSlab,
    wallBucketKeyParts,
} from "./wallCandidateBucketSlab.js";
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
