import { boundsToCellRect } from "../../DataStructures/CellKey.js";
import { forEachSparseCellInRect } from "../../DataStructures/CellRect.js";
import { SparseBucketGrid } from "../../DataStructures/SparseBucketGrid.js";
import { centerHalfExtentsAabbInto, copyAabbInto, createAabb, padAabbInto } from "../../Math/Aabb2D.js";
import { SpatialQuery } from "../query/SpatialQuery.js";
/** @typedef {import("../../Math/Aabb2D.js").Aabb2D} Aabb2D */
const fallbackQuery = new SpatialQuery();
/** @param {Aabb2D} out @param {object} entity */
function writeEntityBoundsInto(out, entity) {
    if (entity.getBounds) {
        copyAabbInto(out, entity.getBounds());
        return out;
    }
    const r = entity.radius || 0;
    return centerHalfExtentsAabbInto(out, entity.x, entity.y, r, r);
}
export class WallSpatialIndex {
    constructor(cellSize) {
        this.cellSize = cellSize;
        this.buckets = new SparseBucketGrid();
        this.boundsScratch = createAabb();
        this.queryBoundsScratch = createAabb();
    }
    clear() {
        this.buckets.clear();
    }
    /**
     * @param {Aabb2D} bounds
     * @param {object | null} exclude
     * @param {number} queryGen
     * @param {(entity: object) => void} fn
     */
    forEachInBounds(bounds, exclude, queryGen, fn) {
        const { minCol, maxCol, minRow, maxRow } = boundsToCellRect(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, this.cellSize);
        forEachSparseCellInRect(minCol, maxCol, minRow, maxRow, (_c, _r, key) => {
            const list = this.buckets.peek(key);
            if (!list) return;
            for (let i = 0; i < list.length; i++) {
                const entity = list[i];
                if (entity === exclude || entity._spatialGen === queryGen) continue;
                entity._spatialGen = queryGen;
                fn(entity);
            }
        });
    }
    insert(entity) {
        const b = writeEntityBoundsInto(this.boundsScratch, entity);
        const { minCol, maxCol, minRow, maxRow } = boundsToCellRect(b.minX, b.minY, b.maxX, b.maxY, this.cellSize);
        forEachSparseCellInRect(minCol, maxCol, minRow, maxRow, (_c, _r, key) => {
            this.buckets.getOrCreate(key).push(entity);
        });
    }
    remove(entity) {
        const b = writeEntityBoundsInto(this.boundsScratch, entity);
        const { minCol, maxCol, minRow, maxRow } = boundsToCellRect(b.minX, b.minY, b.maxX, b.maxY, this.cellSize);
        forEachSparseCellInRect(minCol, maxCol, minRow, maxRow, (_c, _r, key) => {
            this.buckets.removeFrom(key, entity);
        });
    }
    collectNearby(entity, query) {
        const b = writeEntityBoundsInto(this.boundsScratch, entity);
        padAabbInto(this.queryBoundsScratch, b, this.cellSize);
        return query.collectInIndex(this, this.queryBoundsScratch, entity);
    }
    /** @param {Aabb2D} bounds @param {import("../query/SpatialQuery.js").SpatialQuery} [query] */
    collectInBounds(bounds, query = fallbackQuery) {
        return query.collectInIndex(this, bounds);
    }
}
