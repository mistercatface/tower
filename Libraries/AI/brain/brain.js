import { LruMap } from "../../DataStructures/LruMap.js";
export class SpatialCellMemory {
    constructor({ capacity = 64, cols = 64 } = {}) {
        this.capacity = capacity;
        this.cols = cols;
        this.entries = new LruMap(capacity);
        this.stampSeq = 0;
        this._keyBuffer = [];
    }
    get generation() {
        return this.stampSeq;
    }
    get size() {
        return this.entries.size;
    }
    stamp(idx) {
        this.entries.set(idx, this.stampSeq++);
    }
    stampCells(cells) {
        for (let i = 0; i < cells.length; i++) this.entries.set(cells[i], this.stampSeq++);
    }
    has(idx) {
        return this.entries.has(idx);
    }
    getRecencyRankFromNewest(targetIdx) {
        if (!this.entries.has(targetIdx)) return -1;
        let rankFromOldest = 0;
        for (const key of this.entries.keys()) {
            if (key === targetIdx) return this.entries.size - 1 - rankFromOldest;
            rankFromOldest++;
        }
        return -1;
    }
    clear() {
        this.entries.clear();
        this.stampSeq = 0;
    }
    forEachNewestFirstKey(fn) {
        const buf = this._keyBuffer;
        buf.length = 0;
        for (const key of this.entries.keys()) buf.push(key);
        for (let i = buf.length - 1; i >= 0; i--) fn(buf[i], this.entries.peek(buf[i]), buf.length - 1 - i);
    }
    forEachNewestFirst(fn) {
        const buf = this._keyBuffer;
        buf.length = 0;
        for (const key of this.entries.keys()) buf.push(key);
        for (let i = buf.length - 1; i >= 0; i--) fn(buf[i], this.entries.peek(buf[i]), buf.length - 1 - i);
    }
}
export function createSpatialCellMemory(config) {
    return new SpatialCellMemory(config);
}
