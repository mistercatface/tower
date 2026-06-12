import { boundsToCellRect } from "../../DataStructures/CellKey.js";
import { forEachSparseCellInRect } from "../../DataStructures/CellRect.js";
import { SparseBucketGrid } from "../../DataStructures/SparseBucketGrid.js";
import { centerHalfExtentsAabbInto, copyAabbInto, createAabb } from "../../Math/Aabb2D.js";
import { SpatialQuery } from "../query/SpatialQuery.js";
const fallbackQuery = new SpatialQuery();
/** @param {import("../../Math/Aabb2D.js").Aabb2D} out @param {object} entity */
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
    }
    clear() {
        this.buckets.clear();
    }
    forEachInBoundsCoords(minX, minY, maxX, maxY, exclude, queryGen, fn) {
        const { minCol, maxCol, minRow, maxRow } = boundsToCellRect(minX, minY, maxX, maxY, this.cellSize);
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
        const padding = this.cellSize;
        return query.collectInIndexCoords(this, b.minX - padding, b.minY - padding, b.maxX + padding, b.maxY + padding, entity);
    }
    /** @param {import("../../Math/Aabb2D.js").Aabb2D} bounds @param {import("../query/SpatialQuery.js").SpatialQuery} [query] */
    collectInBounds(bounds, query = fallbackQuery) {
        return query.collectInIndexCoords(this, bounds.minX, bounds.minY, bounds.maxX, bounds.maxY);
    }
}
