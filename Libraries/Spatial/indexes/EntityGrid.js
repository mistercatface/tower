import { cellInRect } from "../../Spatial/grid/GridUtils.js";
import { centerReachAabbInto, createAabb, padAabbInto } from "../../Math/Aabb2D.js";
import { entityBroadphaseExtent, kineticNeighborQueryPad } from "../collision/entityBroadphase.js";
/** @typedef {import("../query/SpatialQuery.js").SpatialQuery} SpatialQueryType */
/** @typedef {import("../../Math/Aabb2D.js").Aabb2D} Aabb2D */
import { MAX_ENTITIES } from "../../../Core/engineLimits.js";
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
        if (!cellInRect(col, row, this.cols, this.rows)) return -1;
        return col + row * this.cols;
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
        if (idx === -1 || idx === undefined) return;
        const targetId = entity._physId;
        let curr = this.cellHead[idx];
        let prev = -1;
        while (curr !== -1) {
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
            padAabbInto(this.queryBoundsScratch, bounds, this.maxInsertedExtent + kineticNeighborQueryPad());
            return query.collectInIndex(this, this.queryBoundsScratch, exclude);
        }
        return query.collectInIndex(this, bounds, exclude);
    }
    collectNearbyInto(entity, out) {
        out.length = 0;
        this.queryGen++;
        const searchRadius = entityBroadphaseExtent(entity) + this.maxInsertedExtent + kineticNeighborQueryPad();
        centerReachAabbInto(this.queryBoundsScratch, entity.x, entity.y, searchRadius);
        this.forEachInBounds(this.queryBoundsScratch, entity, this.queryGen, (other) => {
            out.push(other);
        });
        return out;
    }
}
