/**
 * LRU cache of baked frame sets (arrays of ImageBitmap, or a single bitmap).
 *
 * Shared by floor chunks and wall faces. Owns the lifecycle of the bitmaps it
 * stores: evicted/replaced entries are closed so the GPU-backed memory is freed.
 * Placeholder sentinels (`{ isPlaceholder: true }`) pass through untouched.
 */
export class BakedFrameCache {
    constructor(maxEntries = 512) {
        this.maxEntries = maxEntries;
        this.cache = new Map();
    }

    get(key) {
        const value = this.cache.get(key);
        if (value === undefined) return null;
        // Refresh recency.
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }

    _closeBitmaps(value) {
        if (!value) return;
        if (Array.isArray(value)) {
            for (const item of value) {
                if (item instanceof ImageBitmap) item.close();
            }
        } else if (value instanceof ImageBitmap) {
            value.close();
        }
    }

    _evictIfFull(incomingKey) {
        if (this.cache.size >= this.maxEntries && !this.cache.has(incomingKey)) {
            const oldestKey = this.cache.keys().next().value;
            this._closeBitmaps(this.cache.get(oldestKey));
            this.cache.delete(oldestKey);
        }
    }

    set(key, value) {
        this._evictIfFull(key);
        const existing = this.cache.get(key);
        if (existing && existing !== value) {
            this._closeBitmaps(existing);
        }
        this.cache.set(key, value);
    }

    /** Append baked frames without closing reused bitmaps already in the entry. */
    mergeFrames(key, frameStart, newBitmaps) {
        const existing = this.cache.get(key);
        if (!existing || existing[0]?.isPlaceholder) return;

        this.cache.delete(key);
        const merged = existing.slice();
        for (let i = 0; i < newBitmaps.length; i++) {
            merged[frameStart + i] = newBitmaps[i];
        }

        this._evictIfFull(key);
        this.cache.set(key, merged);
    }

    delete(key) {
        const existing = this.cache.get(key);
        if (existing) {
            this._closeBitmaps(existing);
            this.cache.delete(key);
        }
    }

    deleteByPrefix(prefix) {
        for (const key of [...this.cache.keys()]) {
            if (key.startsWith(prefix)) {
                this.delete(key);
            }
        }
    }

    clear() {
        for (const value of this.cache.values()) {
            this._closeBitmaps(value);
        }
        this.cache.clear();
    }
}
