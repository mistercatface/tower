import { SpatialQuery } from "./SpatialQuery.js";

const KEY_STRIDE = 65536;
const fallbackQuery = new SpatialQuery();

export class SpatialHash {
    constructor(cellSize) {
        this.cellSize = cellSize;
        this.cells = new Map();
    }

    clear() {
        this.cells.clear();
    }

    _cellKey(col, row) {
        return col + row * KEY_STRIDE;
    }

    getBounds(entity) {
        if (entity.getBounds) {
            return entity.getBounds();
        }
        const r = entity.radius || 0;
        return {
            minX: entity.x - r,
            minY: entity.y - r,
            maxX: entity.x + r,
            maxY: entity.y + r,
        };
    }

    _cellRangeForBounds(bounds) {
        return {
            minCol: Math.floor(bounds.minX / this.cellSize),
            maxCol: Math.floor(bounds.maxX / this.cellSize),
            minRow: Math.floor(bounds.minY / this.cellSize),
            maxRow: Math.floor(bounds.maxY / this.cellSize),
        };
    }

    forEachInBounds(bounds, exclude, queryGen, fn) {
        const { minCol, maxCol, minRow, maxRow } = this._cellRangeForBounds(bounds);
        for (let r = minRow; r <= maxRow; r++) {
            const rowKey = r * KEY_STRIDE;
            for (let c = minCol; c <= maxCol; c++) {
                const list = this.cells.get(c + rowKey);
                if (!list) continue;
                for (let i = 0; i < list.length; i++) {
                    const entity = list[i];
                    if (entity === exclude || entity._spatialGen === queryGen) continue;
                    entity._spatialGen = queryGen;
                    fn(entity);
                }
            }
        }
    }

    getNeighborQueryBounds(entity) {
        const bounds = this.getBounds(entity);
        return {
            minX: bounds.minX - this.cellSize,
            minY: bounds.minY - this.cellSize,
            maxX: bounds.maxX + this.cellSize,
            maxY: bounds.maxY + this.cellSize,
        };
    }

    insert(entity) {
        const { minCol, maxCol, minRow, maxRow } = this._cellRangeForBounds(this.getBounds(entity));
        for (let r = minRow; r <= maxRow; r++) {
            const rowKey = r * KEY_STRIDE;
            for (let c = minCol; c <= maxCol; c++) {
                const key = c + rowKey;
                if (!this.cells.has(key)) {
                    this.cells.set(key, []);
                }
                this.cells.get(key).push(entity);
            }
        }
    }

    remove(entity) {
        const { minCol, maxCol, minRow, maxRow } = this._cellRangeForBounds(this.getBounds(entity));
        for (let r = minRow; r <= maxRow; r++) {
            const rowKey = r * KEY_STRIDE;
            for (let c = minCol; c <= maxCol; c++) {
                const list = this.cells.get(c + rowKey);
                if (!list) continue;
                const idx = list.indexOf(entity);
                if (idx !== -1) {
                    list.splice(idx, 1);
                }
            }
        }
    }

    collectNearby(entity, query = fallbackQuery) {
        return query.collectInHash(this, this.getNeighborQueryBounds(entity));
    }

    collectInBounds(minX, minY, maxX, maxY, query = fallbackQuery) {
        return query.collectInHash(this, { minX, minY, maxX, maxY });
    }
}
