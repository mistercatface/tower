import { LruMap } from "../../DataStructures/LruMap.js";
export class SpatialCellMemory {
    constructor({ capacity = 64, cols = 64 } = {}) {
        this.capacity = capacity;
        this.cols = cols;
        this.entries = new LruMap(capacity);
        this.stampSeq = 0;
    }
    get generation() {
        return this.stampSeq;
    }
    get size() {
        return this.entries.size;
    }
    _keyFor(col, row) {
        return col + row * this.cols;
    }
    stamp(col, row) {
        const idx = typeof row === "number" ? this._keyFor(col, row) : col;
        this.entries.set(idx, this.stampSeq++);
    }
    stampCells(cells) {
        for (let i = 0; i < cells.length; i++) {
            const cell = cells[i];
            const idx = typeof cell === "number" ? cell : this._keyFor(cell.col, cell.row);
            this.entries.set(idx, this.stampSeq++);
        }
    }
    has(col, row) {
        const idx = typeof row === "number" ? this._keyFor(col, row) : col;
        return this.entries.has(idx);
    }
    getRecencyRankFromNewest(col, row) {
        const target = typeof row === "number" ? this._keyFor(col, row) : col;
        if (!this.entries.has(target)) return -1;
        let rankFromOldest = 0;
        for (const key of this.entries.keys()) {
            if (key === target) return this.entries.size - 1 - rankFromOldest;
            rankFromOldest++;
        }
        return -1;
    }
    clear() {
        this.entries.clear();
        this.stampSeq = 0;
    }
    forEachNewestFirstKey(fn) {
        const keys = [...this.entries.keys()];
        for (let i = keys.length - 1; i >= 0; i--) fn(keys[i], this.entries.peek(keys[i]), keys.length - 1 - i);
    }
    forEachNewestFirst(fn) {
        const keys = [...this.entries.keys()];
        for (let i = keys.length - 1; i >= 0; i--) {
            const idx = keys[i];
            const col = idx % this.cols;
            const row = (idx / this.cols) | 0;
            fn(col, row, this.entries.peek(idx), keys.length - 1 - i);
        }
    }
    forEachOldestFirst(fn) {
        for (const key of this.entries.keys()) {
            const col = key % this.cols;
            const row = (key / this.cols) | 0;
            fn(col, row, this.entries.peek(key));
        }
    }
}
export function createSpatialCellMemory(config) {
    return new SpatialCellMemory(config);
}
