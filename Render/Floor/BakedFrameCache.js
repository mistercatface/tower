import { LRUCache } from "../../Core/LRUCache.js";

/**
 * LRU cache of baked frame sets (arrays of ImageBitmap, or a single bitmap).
 *
 * Shared by floor chunks and wall faces. Owns the lifecycle of the bitmaps it
 * stores: evicted/replaced entries are closed so the GPU-backed memory is freed.
 * Placeholder sentinels (`{ isPlaceholder: true }`) pass through untouched.
 */
export class BakedFrameCache {
    constructor(maxEntries = 512) {
        this._lru = new LRUCache(maxEntries);
    }

    get(key) {
        const value = this._lru.get(key);
        return value === undefined ? null : value;
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

    set(key, value) {
        const existing = this._lru.peek(key);
        if (existing && existing !== value) {
            this._closeBitmaps(existing);
        }

        const evicted = this._lru.set(key, value);
        if (evicted) {
            this._closeBitmaps(evicted.evictedValue);
        }
    }

    /** Append baked frames without closing reused bitmaps already in the entry. */
    mergeFrames(key, frameStart, newBitmaps) {
        const existing = this._lru.peek(key);
        if (!existing || existing[0]?.isPlaceholder) return;

        const merged = existing.slice();
        for (let i = 0; i < newBitmaps.length; i++) {
            merged[frameStart + i] = newBitmaps[i];
        }

        this.set(key, merged);
    }

    delete(key) {
        const existing = this._lru.delete(key);
        if (existing !== undefined) {
            this._closeBitmaps(existing);
        }
    }

    deleteByPrefix(prefix) {
        for (const key of [...this._lru.keys()]) {
            if (key.startsWith(prefix)) {
                this.delete(key);
            }
        }
    }

    clear() {
        for (const value of this._lru.values()) {
            this._closeBitmaps(value);
        }
        this._lru.clear();
    }
}
