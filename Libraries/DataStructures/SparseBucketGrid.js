/** Sparse Map-backed cell buckets with O(active cells) clear. */
export class SparseBucketGrid {
    constructor() {
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
    peek(key) {
        return this.cells.get(key);
    }
    getOrCreate(key) {
        let list = this.cells.get(key);
        if (!list) {
            list = [];
            this.cells.set(key, list);
            this.activeKeys.push(key);
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
        return true;
    }
}
