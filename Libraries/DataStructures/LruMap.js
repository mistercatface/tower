/** Map with LRU eviction using insertion order (delete + re-set on access). */
export class LruMap {
    /**
     * @param {number} [maxSize]
     * @param {{ onEvict?: (key: any, value: any) => void }} [options]
     */
    constructor(maxSize = Infinity, options = {}) {
        this.maxSize = maxSize;
        this.onEvict = options.onEvict ?? null;
        this._map = new Map();
    }
    get size() {
        return this._map.size;
    }
    has(key) {
        return this._map.has(key);
    }
    peek(key) {
        return this._map.get(key);
    }
    get(key) {
        const value = this._map.get(key);
        if (value === undefined) return undefined;
        this._touch(key, value);
        return value;
    }
    set(key, value) {
        if (this._map.has(key)) {
            this._map.delete(key);
            this._map.set(key, value);
            return value;
        }
        if (this.maxSize !== Infinity && this._map.size >= this.maxSize) {
            const oldestKey = this._map.keys().next().value;
            const oldestValue = this._map.get(oldestKey);
            this._map.delete(oldestKey);
            this.onEvict?.(oldestKey, oldestValue);
        }
        this._map.set(key, value);
        return value;
    }
    delete(key) {
        return this._map.delete(key);
    }
    clear() {
        this._map.clear();
    }
    keys() {
        return this._map.keys();
    }
    values() {
        return this._map.values();
    }
    entries() {
        return this._map.entries();
    }
    _touch(key, value) {
        this._map.delete(key);
        this._map.set(key, value);
    }
}
