/** Sparse Map-backed cell buckets with array pooling to avoid GC. */
export class SparseBucketGrid {
    constructor() {
        this.cells = new Map();
        this.pool = [];
    }
    clear() {
        for (const list of this.cells.values()) {
            list.length = 0;
            this.pool.push(list);
        }
        this.cells.clear();
    }
    peek(key) {
        return this.cells.get(key);
    }
    getOrCreate(key) {
        let list = this.cells.get(key);
        if (!list) {
            list = this.pool.length > 0 ? this.pool.pop() : [];
            this.cells.set(key, list);
        }
        return list;
    }
    push(key, item) {
        this.getOrCreate(key).push(item);
    }
    removeFrom(key, item) {
        const list = this.cells.get(key);
        if (!list) return false;
        const idx = list.indexOf(item);
        if (idx === -1) return false;
        list.splice(idx, 1);
        if (list.length === 0) {
            this.cells.delete(key);
            this.pool.push(list);
        }
        return true;
    }
}
