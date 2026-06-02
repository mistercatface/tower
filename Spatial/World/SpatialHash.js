import { SpatialQuery } from "./SpatialQuery.js";

const KEY_STRIDE = 65536;
const fallbackQuery = new SpatialQuery();

export class SpatialHash {
    constructor(cellSize) {
        this.cellSize = cellSize;
        this.cells = new Map();
        this.activeKeys = [];
    }

    clear() {
        for (let i = 0; i < this.activeKeys.length; i++) {
            const list = this.cells.get(this.activeKeys[i]);
            if (list) list.length = 0;
        }
        this.activeKeys.length = 0;
    }

    _cellKey(col, row) {
        return col + row * KEY_STRIDE;
    }

    getBounds(entity) {
        if (entity.getBounds) return entity.getBounds();
        const r = entity.radius || 0;
        return { minX: entity.x - r, minY: entity.y - r, maxX: entity.x + r, maxY: entity.y + r };
    }

    forEachInBoundsCoords(minX, minY, maxX, maxY, exclude, queryGen, fn) {
        const cellSize = this.cellSize;
        const minCol = Math.floor(minX / cellSize);
        const maxCol = Math.floor(maxX / cellSize);
        const minRow = Math.floor(minY / cellSize);
        const maxRow = Math.floor(maxY / cellSize);

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
        if (entity.getBounds) {
            const b = entity.getBounds();
            return {
                minX: b.minX - this.cellSize,
                minY: b.minY - this.cellSize,
                maxX: b.maxX + this.cellSize,
                maxY: b.maxY + this.cellSize
            };
        }
        const r = entity.radius || 0;
        return {
            minX: entity.x - r - this.cellSize,
            minY: entity.y - r - this.cellSize,
            maxX: entity.x + r + this.cellSize,
            maxY: entity.y + r + this.cellSize
        };
    }

    insert(entity) {
        let minX, minY, maxX, maxY;
        if (entity.getBounds) {
            const b = entity.getBounds();
            minX = b.minX; minY = b.minY; maxX = b.maxX; maxY = b.maxY;
        } else {
            const r = entity.radius || 0;
            minX = entity.x - r;
            minY = entity.y - r;
            maxX = entity.x + r;
            maxY = entity.y + r;
        }

        const cellSize = this.cellSize;
        const minCol = Math.floor(minX / cellSize);
        const maxCol = Math.floor(maxX / cellSize);
        const minRow = Math.floor(minY / cellSize);
        const maxRow = Math.floor(maxY / cellSize);

        for (let r = minRow; r <= maxRow; r++) {
            const rowKey = r * KEY_STRIDE;
            for (let c = minCol; c <= maxCol; c++) {
                const key = c + rowKey;
                let list = this.cells.get(key);
                if (!list) {
                    list = [];
                    this.cells.set(key, list);
                }
                if (list.length === 0) {
                    this.activeKeys.push(key);
                }
                list.push(entity);
            }
        }
    }

    remove(entity) {
        let minX, minY, maxX, maxY;
        if (entity.getBounds) {
            const b = entity.getBounds();
            minX = b.minX; minY = b.minY; maxX = b.maxX; maxY = b.maxY;
        } else {
            const r = entity.radius || 0;
            minX = entity.x - r;
            minY = entity.y - r;
            maxX = entity.x + r;
            maxY = entity.y + r;
        }

        const cellSize = this.cellSize;
        const minCol = Math.floor(minX / cellSize);
        const maxCol = Math.floor(maxX / cellSize);
        const minRow = Math.floor(minY / cellSize);
        const maxRow = Math.floor(maxY / cellSize);

        for (let r = minRow; r <= maxRow; r++) {
            const rowKey = r * KEY_STRIDE;
            for (let c = minCol; c <= maxCol; c++) {
                const list = this.cells.get(c + rowKey);
                if (!list) continue;
                const idx = list.indexOf(entity);
                if (idx !== -1) list.splice(idx, 1);
            }
        }
    }

    collectNearby(entity, query = fallbackQuery) {
        let minX, minY, maxX, maxY;
        if (entity.getBounds) {
            const b = entity.getBounds();
            minX = b.minX; minY = b.minY; maxX = b.maxX; maxY = b.maxY;
        } else {
            const r = entity.radius || 0;
            minX = entity.x - r;
            minY = entity.y - r;
            maxX = entity.x + r;
            maxY = entity.y + r;
        }
        const padding = this.cellSize;
        return query.collectInHashCoords(this, minX - padding, minY - padding, maxX + padding, maxY + padding, entity);
    }

    collectInBounds(minX, minY, maxX, maxY, query = fallbackQuery) {
        return query.collectInHashCoords(this, minX, minY, maxX, maxY);
    }
}
