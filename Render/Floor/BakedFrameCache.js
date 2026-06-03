export class BakedFrameCache {
    constructor(maxEntries = 512) {
        this.maxEntries = maxEntries;
        this.cache = new Map();
    }

    get(key) {
        const value = this.cache.get(key);
        if (value === undefined) return null;
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }

    peek(key) {
        const value = this.cache.get(key);
        return value === undefined ? null : value;
    }

    _closeOrphanedBitmaps(oldVal, newVal) {
        if (!oldVal) return;
        const isReused = (item) => {
            if (!newVal) return false;
            if (Array.isArray(newVal)) return newVal.includes(item);
            return newVal === item;
        };

        if (Array.isArray(oldVal)) {
            for (const item of oldVal) {
                if (item instanceof ImageBitmap && !isReused(item)) {
                    item.close();
                }
            }
        } else if (oldVal instanceof ImageBitmap && !isReused(oldVal)) {
            oldVal.close();
        }
    }

    set(key, value) {
        const existing = this.peek(key);
        if (existing && existing !== value) {
            this._closeOrphanedBitmaps(existing, value);
        }
        if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
            const oldestKey = this.cache.keys().next().value;
            const oldestValue = this.cache.get(oldestKey);
            this._closeOrphanedBitmaps(oldestValue, null);
            this.cache.delete(oldestKey);
        }
        this.cache.delete(key);
        this.cache.set(key, value);
    }

    mergeFrames(key, frameStart, newBitmaps) {
        const existing = this.peek(key);
        if (!existing || existing[0]?.isPlaceholder) return;
        const merged = existing.slice();
        for (let i = 0; i < newBitmaps.length; i++) {
            merged[frameStart + i] = newBitmaps[i];
        }
        this.set(key, merged);
    }

    delete(key) {
        const existing = this.cache.get(key);
        if (existing !== undefined) {
            this._closeOrphanedBitmaps(existing, null);
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
            this._closeOrphanedBitmaps(value, null);
        }
        this.cache.clear();
    }
}
