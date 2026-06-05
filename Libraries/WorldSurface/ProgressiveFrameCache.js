import { LruMap } from "../DataStructures/LruMap.js";
import { nextAnimationBatchRange } from "./AnimationFrameBake.js";

export class ProgressiveFrameCache {
    constructor(maxEntries = 512) {
        this.maxEntries = maxEntries;
        this.cache = new LruMap(maxEntries, {
            onEvict: (key, value) => {
                this._closeOrphanedBitmaps(value, null);
                this._dropEntry(key);
            },
        });
        /** Bake/load params keyed with cache entries; cleared on delete, eviction, and clear. */
        this._meta = new Map();
        this._generation = new Map();
        this._globalGeneration = 0;
        this._pendingFill = new Map();
    }

    _dropEntry(key) {
        this._generation.delete(key);
        this._pendingFill.delete(key);
        this._meta.delete(key);
    }

    setMeta(key, meta) {
        if (this.cache.has(key)) {
            this._meta.set(key, meta);
        }
    }

    getMeta(key) {
        return this._meta.get(key);
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
        const existing = this.cache.peek(key);
        if (existing !== undefined) {
            this._closeOrphanedBitmaps(existing, null);
            this.cache.delete(key);
            this._dropEntry(key);
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
        this._generation.clear();
        this._pendingFill.clear();
        this._meta.clear();
    }

    /** True while any cached surface is still waiting on its first worker bake. */
    hasPlaceholders() {
        for (const value of this.cache.values()) {
            if (Array.isArray(value) && value[0]?.isPlaceholder) {
                return true;
            }
        }
        return false;
    }

    /**
     * Retrieves the canvas array for the key. If empty, sets a placeholder and returns it.
     * @param {string} key
     * @param {object} [meta] — optional bake spec stored for the lifetime of this cache entry
     */
    getOrStart(key, meta) {
        let canvases = this.get(key);
        if (canvases) return canvases;

        const placeholder = [{ isPlaceholder: true }];
        this.set(key, placeholder);

        const generation = ++this._globalGeneration;
        this._generation.set(key, generation);
        if (meta !== undefined) {
            this._meta.set(key, meta);
        }

        return placeholder;
    }

    /**
     * Checks if the generation matches, preventing stale async writes.
     */
    isValidGeneration(key, generation) {
        return this._generation.get(key) === generation;
    }

    getCurrentGeneration(key) {
        return this._generation.get(key);
    }

    /**
     * Replaces the placeholder with the first frame bitmaps.
     */
    commitFirstFrame(key, generation, bitmaps) {
        if (!this.isValidGeneration(key, generation)) {
            bitmaps.forEach((b) => b.close());
            return;
        }
        const existing = this.peek(key);
        if (existing?.[0]?.isPlaceholder === true) {
            this.set(key, bitmaps);
        } else if (existing !== bitmaps) {
            bitmaps.forEach((b) => b.close());
        }
    }

    /**
     * Mark a key as needing an animation batch fill.
     */
    requestFill(key, fetchBatch, totalFrames) {
        if (!this._pendingFill.has(key)) {
            this._pendingFill.set(key, { fetchBatch, totalFrames });
        }
    }

    /**
     * Tick function to run outside the draw loop to schedule animation batches.
     */
    updateFills() {
        if (this._pendingFill.size === 0) return;

        // Make a copy so we don't infinitely loop if things re-add
        const entries = Array.from(this._pendingFill.entries());
        this._pendingFill.clear();

        for (const [key, { fetchBatch, totalFrames }] of entries) {
            const canvases = this.peek(key);

            if (!canvases) {
                continue;
            }
            if (canvases[0]?.isPlaceholder) {
                this._pendingFill.set(key, { fetchBatch, totalFrames });
                continue;
            }
            if (canvases.length >= totalFrames) {
                continue;
            }

            const generation = this.getCurrentGeneration(key);
            if (generation == null) continue;

            const batch = nextAnimationBatchRange(canvases.length, totalFrames);
            if (!batch) continue;

            fetchBatch(batch).then((bitmaps) => {
                if (!this.isValidGeneration(key, generation)) {
                    bitmaps.forEach((b) => b.close());
                    return;
                }
                const existing = this.peek(key);
                if (!existing || existing[0]?.isPlaceholder) {
                    bitmaps.forEach((b) => b.close());
                    return;
                }
                this.mergeFrames(key, batch.frameStart, bitmaps);

                const merged = this.peek(key);
                if (merged && merged.length < totalFrames) {
                    this.requestFill(key, fetchBatch, totalFrames);
                }
            });
        }
    }
}