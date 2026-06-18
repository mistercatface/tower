import { EntityGrid } from "../indexes/EntityGrid.js";
import { collectWallSegmentsForEntity } from "../query/wallSegmentQuery.js";
import { SpatialQuery } from "../query/SpatialQuery.js";
import { centerReachAabbInto, createAabb } from "../../Math/Aabb2D.js";
import { entityBroadphaseExtent, NEIGHBOR_QUERY_PAD } from "../collision/entityBroadphase.js";
/** @typedef {import("../../Math/Aabb2D.js").Aabb2D} Aabb2D */
const NEAR_QUERY_BOUNDS = createAabb();
/** @typedef {import("../query/wallContext.js").WallContext} WallContext */
/**
 * Duck-typed per-tick spatial frame: entity grid, neighbor cache, wall segment cache.
 * Game adapters call resetFrame / insertEntity / setWallContext then run pair policies.
 */
export class SpatialFrameCore {
    constructor(cellSize = 50) {
        this.entityGrid = new EntityGrid(cellSize);
        this.wallQuery = new SpatialQuery();
        this.frameId = 0;
        this._wallCache = new Map();
        /** @type {WallContext | null} */
        this._wallContext = null;
    }
    /** @param {(import("../Math/Aabb2D.js").Aabb2D & { cols: number, cellSize: number }) | null} obstacleGrid */
    resetFrame(obstacleGrid) {
        this.frameId = (this.frameId + 1) | 0;
        this._wallCache.clear();
        this.entityGrid.syncBounds(obstacleGrid);
        this.entityGrid.clear();
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
     * Bumps frameId and clears wall cache so broadphase + wall resolve see new poses.
     *
     * @param {object[]} bodies
     */
    reindexKineticBodies(bodies) {
        if (!bodies?.length) return;
        for (let i = 0; i < bodies.length; i++) {
            const entity = bodies[i];
            if (entity.isDead) continue;
            this.entityGrid.remove(entity);
            this.entityGrid.insert(entity);
            entity._neighborsFrameId = -1;
        }
        this.frameId = (this.frameId + 1) | 0;
        this._wallCache.clear();
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
    getWallCandidates(entity) {
        const cached = this._wallCache.get(entity.id);
        if (cached) return cached;
        const segments = collectWallSegmentsForEntity(this.wallQuery, this._wallContext, entity);
        this._wallCache.set(entity.id, segments);
        return segments;
    }
    /**
     * @param {object[]} group
     * @param {(primary: object, neighbor: object) => boolean} shouldPair
     */
    forEachGroupNeighborPair(group, shouldPair, fn) {
        for (let i = 0; i < group.length; i++) {
            const primary = group[i];
            if (primary.isDead) continue;
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
        const searchRadius = entityBroadphaseExtent(anchor) + this.entityGrid.maxInsertedExtent + NEIGHBOR_QUERY_PAD;
        centerReachAabbInto(NEAR_QUERY_BOUNDS, anchor.x, anchor.y, searchRadius);
        return this.entityGrid.collectInBounds(NEAR_QUERY_BOUNDS, this.wallQuery, exclude, { expandForEntityExtents: false });
    }
}
