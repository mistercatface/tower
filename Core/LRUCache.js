/**
 * Map-backed LRU cache. Most-recent entry is at the end of insertion order.
 */
export class LRUCache {
    constructor(maxSize = 512) {
        this.maxSize = maxSize;
        this._map = new Map();
    }

    get size() {
        return this._map.size;
    }

    has(key) {
        return this._map.has(key);
    }

    /** @param {{ touch?: boolean }} [options] touch=false skips recency update (peek). */
    get(key, { touch = true } = {}) {
        const value = this._map.get(key);
        if (value === undefined) return undefined;
        if (touch) {
            this._map.delete(key);
            this._map.set(key, value);
        }
        return value;
    }

    peek(key) {
        return this.get(key, { touch: false });
    }

    /**
     * @returns {{ evictedKey: *, evictedValue: * } | null} entry removed to make room, if any
     */
    set(key, value) {
        let evicted = null;
        if (this._map.has(key)) {
            this._map.delete(key);
        } else if (this._map.size >= this.maxSize) {
            const evictedKey = this._map.keys().next().value;
            evicted = { evictedKey, evictedValue: this._map.get(evictedKey) };
            this._map.delete(evictedKey);
        }
        this._map.set(key, value);
        return evicted;
    }

    /** @returns {*} removed value, or undefined */
    delete(key) {
        const value = this._map.get(key);
        if (value === undefined) return undefined;
        this._map.delete(key);
        return value;
    }

    keys() {
        return this._map.keys();
    }

    values() {
        return this._map.values();
    }

    clear() {
        this._map.clear();
    }
}
