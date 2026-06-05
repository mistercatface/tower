import { EntityGrid } from "../indexes/EntityGrid.js";
import { collectWallSegmentsForEntity } from "../query/wallSegmentQuery.js";
import { SpatialQuery } from "../query/SpatialQuery.js";

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

    /** @param {{ minX: number, minY: number, maxX: number, maxY: number } | null} obstacleGrid */
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

    getNeighbors(entity) {
        if (entity._neighborsFrameId === this.frameId) {
            return entity._neighbors;
        }

        if (!entity._neighbors) {
            entity._neighbors = [];
        } else {
            entity._neighbors.length = 0;
        }

        const res = this.entityGrid.collectNearby(entity);
        for (let i = 0; i < res.length; i++) {
            entity._neighbors.push(res[i]);
        }

        entity._neighborsFrameId = this.frameId;
        return entity._neighbors;
    }

    forEachNeighbor(entity, fn) {
        const neighbors = this.getNeighbors(entity);
        for (let i = 0; i < neighbors.length; i++) {
            fn(neighbors[i]);
        }
    }

    getWallCandidates(entity) {
        const cached = this._wallCache.get(entity.id);
        if (cached) {
            return cached;
        }

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
}
