export class SpatialHash {
    constructor(cellSize) {
        this.cellSize = cellSize;
        this.cells = new Map();
    }

    clear() {
        this.cells.clear();
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
            maxY: entity.y + r
        };
    }

    insert(entity) {
        const bounds = this.getBounds(entity);
        const minCol = Math.floor(bounds.minX / this.cellSize);
        const maxCol = Math.floor(bounds.maxX / this.cellSize);
        const minRow = Math.floor(bounds.minY / this.cellSize);
        const maxRow = Math.floor(bounds.maxY / this.cellSize);

        for (let r = minRow; r <= maxRow; r++) {
            for (let c = minCol; c <= maxCol; c++) {
                const key = `${c},${r}`;
                if (!this.cells.has(key)) this.cells.set(key, []);
                this.cells.get(key).push(entity);
            }
        }
    }

    remove(entity) {
        const bounds = this.getBounds(entity);
        const minCol = Math.floor(bounds.minX / this.cellSize);
        const maxCol = Math.floor(bounds.maxX / this.cellSize);
        const minRow = Math.floor(bounds.minY / this.cellSize);
        const maxRow = Math.floor(bounds.maxY / this.cellSize);

        for (let r = minRow; r <= maxRow; r++) {
            for (let c = minCol; c <= maxCol; c++) {
                const key = `${c},${r}`;
                if (this.cells.has(key)) {
                    const list = this.cells.get(key);
                    const idx = list.indexOf(entity);
                    if (idx !== -1) {
                        list.splice(idx, 1);
                    }
                }
            }
        }
    }

    getNearby(entity) {
        const bounds = this.getBounds(entity);
        // Query slightly larger area around the entity bounds for safe separation/collision
        const minCol = Math.floor((bounds.minX - this.cellSize) / this.cellSize);
        const maxCol = Math.floor((bounds.maxX + this.cellSize) / this.cellSize);
        const minRow = Math.floor((bounds.minY - this.cellSize) / this.cellSize);
        const maxRow = Math.floor((bounds.maxY + this.cellSize) / this.cellSize);

        const resultSet = new Set();
        for (let r = minRow; r <= maxRow; r++) {
            for (let c = minCol; c <= maxCol; c++) {
                const key = `${c},${r}`;
                const list = this.cells.get(key);
                if (list) {
                    for (let i = 0; i < list.length; i++) {
                        resultSet.add(list[i]);
                    }
                }
            }
        }
        return Array.from(resultSet);
    }

    queryBounds(minX, minY, maxX, maxY) {
        const minCol = Math.floor(minX / this.cellSize);
        const maxCol = Math.floor(maxX / this.cellSize);
        const minRow = Math.floor(minY / this.cellSize);
        const maxRow = Math.floor(maxY / this.cellSize);

        const resultSet = new Set();
        for (let r = minRow; r <= maxRow; r++) {
            for (let c = minCol; c <= maxCol; c++) {
                const key = `${c},${r}`;
                const list = this.cells.get(key);
                if (list) {
                    for (let i = 0; i < list.length; i++) {
                        resultSet.add(list[i]);
                    }
                }
            }
        }
        return Array.from(resultSet);
    }
}