import { boundsToCellRect } from "../../DataStructures/CellKey.js";
import { forEachSparseCellInRect } from "../../DataStructures/CellRect.js";
import { SparseBucketGrid } from "../../DataStructures/SparseBucketGrid.js";
import { SpatialQuery } from "../query/SpatialQuery.js";
const fallbackQuery = new SpatialQuery();
export class WallSpatialIndex {
    constructor(cellSize) {
        this.cellSize = cellSize;
        this.buckets = new SparseBucketGrid();
    }
    clear() {
        this.buckets.clear();
    }
    getBounds(entity) {
        if (entity.getBounds) return entity.getBounds();
        const r = entity.radius || 0;
        return { minX: entity.x - r, minY: entity.y - r, maxX: entity.x + r, maxY: entity.y + r };
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
    getNeighborQueryBounds(entity) {
        if (entity.getBounds) {
            const b = entity.getBounds();
            return { minX: b.minX - this.cellSize, minY: b.minY - this.cellSize, maxX: b.maxX + this.cellSize, maxY: b.maxY + this.cellSize };
        }
        const r = entity.radius || 0;
        return { minX: entity.x - r - this.cellSize, minY: entity.y - r - this.cellSize, maxX: entity.x + r + this.cellSize, maxY: entity.y + r + this.cellSize };
    }
    insert(entity) {
        let minX, minY, maxX, maxY;
        if (entity.getBounds) {
            const b = entity.getBounds();
            minX = b.minX;
            minY = b.minY;
            maxX = b.maxX;
            maxY = b.maxY;
        } else {
            const r = entity.radius || 0;
            minX = entity.x - r;
            minY = entity.y - r;
            maxX = entity.x + r;
            maxY = entity.y + r;
        }
        const { minCol, maxCol, minRow, maxRow } = boundsToCellRect(minX, minY, maxX, maxY, this.cellSize);
        forEachSparseCellInRect(minCol, maxCol, minRow, maxRow, (_c, _r, key) => {
            this.buckets.getOrCreate(key).push(entity);
        });
    }
    remove(entity) {
        let minX, minY, maxX, maxY;
        if (entity.getBounds) {
            const b = entity.getBounds();
            minX = b.minX;
            minY = b.minY;
            maxX = b.maxX;
            maxY = b.maxY;
        } else {
            const r = entity.radius || 0;
            minX = entity.x - r;
            minY = entity.y - r;
            maxX = entity.x + r;
            maxY = entity.y + r;
        }
        const { minCol, maxCol, minRow, maxRow } = boundsToCellRect(minX, minY, maxX, maxY, this.cellSize);
        forEachSparseCellInRect(minCol, maxCol, minRow, maxRow, (_c, _r, key) => {
            this.buckets.removeFrom(key, entity);
        });
    }
    collectNearby(entity, query) {
        let minX, minY, maxX, maxY;
        if (entity.getBounds) {
            const b = entity.getBounds();
            minX = b.minX;
            minY = b.minY;
            maxX = b.maxX;
            maxY = b.maxY;
        } else {
            const r = entity.radius || 0;
            minX = entity.x - r;
            minY = entity.y - r;
            maxX = entity.x + r;
            maxY = entity.y + r;
        }
        const padding = this.cellSize;
        return query.collectInIndexCoords(this, minX - padding, minY - padding, maxX + padding, maxY + padding, entity);
    }
    collectInBounds(minX, minY, maxX, maxY, query = fallbackQuery) {
        return query.collectInIndexCoords(this, minX, minY, maxX, maxY);
    }
}
