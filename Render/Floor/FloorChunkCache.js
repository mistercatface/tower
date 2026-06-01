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

    set(key, canvas) {
        if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }
        this.cache.set(key, canvas);
    }

    delete(key) {
        this.cache.delete(key);
    }

    clear() {
        this.cache.clear();
    }
}
