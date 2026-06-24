import { SparseBucketGrid } from "../../DataStructures/SparseBucketGrid.js";

/**
 * A generic perceivable prop category system based on obstacle-grid cells.
 * Maps prop instances to the nav-grid aligned bucket grid.
 */
export class CellPropIndex {
    constructor() {
        this.buckets = new SparseBucketGrid();
        this.count = new Uint16Array(0);
        this.minX = 0;
        this.minY = 0;
        this.cols = 0;
        this.rows = 0;
        this.cellSize = 16;
    }

    _propToCellIdx(prop) {
        if (!this.cols || !this.rows) return -1;
        const col = Math.floor((prop.x - this.minX) / this.cellSize);
        const row = Math.floor((prop.y - this.minY) / this.cellSize);
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return -1;
        return col + row * this.cols;
    }

    register(prop) {
        if (prop._cellIndexCell !== undefined && prop._cellIndexCell !== -1) return;
        const idx = this._propToCellIdx(prop);
        prop._cellIndexCell = idx;
        if (idx !== -1) {
            this.buckets.push(idx, prop);
            this.count[idx]++;
        }
    }

    unregister(prop) {
        const idx = prop._cellIndexCell;
        if (idx !== undefined && idx !== -1) if (this.buckets.removeFrom(idx, prop)) this.count[idx]--;

        prop._cellIndexCell = -1;
    }

    reconcile(prop) {
        if (prop._cellIndexCell === undefined) return;
        const newIdx = this._propToCellIdx(prop);
        if (prop._cellIndexCell === newIdx) return;
        this.unregister(prop);
        this.register(prop);
    }

    countAtIdx(idx) {
        if (idx < 0 || idx >= this.count.length) return 0;
        return this.count[idx];
    }

    countAtCell(col, row) {
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return 0;
        return this.count[col + row * this.cols];
    }

    forEachItemInCell(col, row, fn) {
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return;
        const idx = col + row * this.cols;
        if (this.count[idx] === 0) return;
        const list = this.buckets.peek(idx);
        if (!list) return;
        for (let i = 0; i < list.length; i++) fn(list[i]);
    }

    nearestItemInCell(col, row, x, y, accept) {
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return null;
        const idx = col + row * this.cols;
        if (this.count[idx] === 0) return null;
        const list = this.buckets.peek(idx);
        if (!list) return null;

        let nearest = null;
        let bestDistSq = Infinity;
        for (let i = 0; i < list.length; i++) {
            const prop = list[i];
            if (!accept(prop)) continue;
            const dx = prop.x - x;
            const dy = prop.y - y;
            const distSq = dx * dx + dy * dy;
            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                nearest = prop;
            }
        }
        return nearest;
    }

    syncBounds(grid) {
        if (this.cols === grid.cols && this.rows === grid.rows && this.cellSize === grid.cellSize && this.minX === grid.minX && this.minY === grid.minY) return;

        this.minX = grid.minX;
        this.minY = grid.minY;
        this.cols = grid.cols;
        this.rows = grid.rows;
        this.cellSize = grid.cellSize;

        const allProps = [];
        for (const list of this.buckets.cells.values()) for (let i = 0; i < list.length; i++) allProps.push(list[i]);

        this.buckets.clear();
        this.count = new Uint16Array(this.cols * this.rows);

        for (let i = 0; i < allProps.length; i++) {
            const prop = allProps[i];
            prop._cellIndexCell = -1; // reset before registering
            this.register(prop);
        }
    }
}
