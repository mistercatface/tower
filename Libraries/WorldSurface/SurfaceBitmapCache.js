import { LruMap } from "../DataStructures/LruMap.js";
import { isDrawableBakedSurface } from "./WorldSurfaceResolution.js";
/** LRU cache of baked surface ImageBitmap arrays (world chunks + wall atlases). */
export class SurfaceBitmapCache {
    constructor(maxEntries = 512) {
        this.maxEntries = maxEntries;
        this.cache = new LruMap(maxEntries, {
            onEvict: (key, value) => {
                this._closeOrphanedBitmaps(value, null);
                this._dropEntry(key);
            },
        });
        this._generation = new Map();
        this._globalGeneration = 0;
    }
    _dropEntry(key) {
        this._generation.delete(key);
    }
    get(key) {
        const value = this.cache.get(key);
        return value === undefined ? null : value;
    }
    peek(key) {
        const value = this.cache.peek(key);
        return value === undefined ? null : value;
    }
    _closeOrphanedBitmaps(oldVal, newVal) {
        if (!oldVal) return;
        const isReused = (item) => {
            if (!newVal) return false;
            if (Array.isArray(newVal)) return newVal.includes(item);
            return newVal === item;
        };
        if (Array.isArray(oldVal))
            for (const item of oldVal) {
                if (item instanceof ImageBitmap && !isReused(item)) item.close();
            }
        else if (oldVal instanceof ImageBitmap && !isReused(oldVal)) oldVal.close();
    }
    set(key, value) {
        const existing = this.peek(key);
        if (existing && existing !== value) this._closeOrphanedBitmaps(existing, value);
        this.cache.set(key, value);
    }
    delete(key) {
        const existing = this.cache.peek(key);
        if (existing !== undefined) {
            this._closeOrphanedBitmaps(existing, null);
            this.cache.delete(key);
            this._dropEntry(key);
        }
    }
    deleteByPrefix(prefix) {
        for (const key of [...this.cache.keys()]) if (key.startsWith(prefix)) this.delete(key);
    }
    clear() {
        for (const value of this.cache.values()) this._closeOrphanedBitmaps(value, null);
        this.cache.clear();
        this._generation.clear();
    }
    /** True while any cached surface is still waiting on its worker bake. */
    hasPlaceholders() {
        for (const value of this.cache.values()) if (Array.isArray(value) && value[0]?.isPlaceholder) return true;
        return false;
    }
    getOrStart(key) {
        let canvases = this.get(key);
        if (canvases) return canvases;
        const placeholder = [{ isPlaceholder: true }];
        this.set(key, placeholder);
        this._generation.set(key, ++this._globalGeneration);
        return placeholder;
    }
    isValidGeneration(key, generation) {
        return this._generation.get(key) === generation;
    }
    getCurrentGeneration(key) {
        return this._generation.get(key);
    }
    commitBake(key, generation, bitmaps) {
        if (!this.isValidGeneration(key, generation)) {
            bitmaps.forEach((b) => b.close());
            return;
        }
        if (!bitmaps?.length || !isDrawableBakedSurface(bitmaps[0])) return;
        const existing = this.peek(key);
        if (existing?.[0]?.isPlaceholder === true) this.set(key, bitmaps);
        else if (existing !== bitmaps) bitmaps.forEach((b) => b.close());
    }
}
