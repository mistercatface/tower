import { floorTileSettings } from "../../Config/Config.js";

export class FloorChunkCache {
    constructor(maxEntries = floorTileSettings.maxCachedChunks) {
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

    _closeBitmaps(value) {
        if (!value) return;
        if (Array.isArray(value)) {
            value.forEach(item => {
                if (item instanceof ImageBitmap) {
                    item.close();
                }
            });
        } else if (value instanceof ImageBitmap) {
            value.close();
        }
    }

    set(key, canvas) {
        if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
            const oldestKey = this.cache.keys().next().value;
            this._closeBitmaps(this.cache.get(oldestKey));
            this.cache.delete(oldestKey);
        }
        const existing = this.cache.get(key);
        if (existing && existing !== canvas) {
            this._closeBitmaps(existing);
        }
        this.cache.set(key, canvas);
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
