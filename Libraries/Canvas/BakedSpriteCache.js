import { LruMap } from "../DataStructures/LruMap.js";
import { releaseOffscreenCanvas } from "./offscreenCanvas.js";
/**
 * Dispose a cache entry's canvas/bitmap handle correctly.
 * ImageBitmaps must be explicitly closed; OffscreenCanvases go back to the pool.
 * @param {object} entry
 */
function disposeEntry(entry) {
    if (entry._isBitmap) entry.canvas.close();
    else releaseOffscreenCanvas(entry.canvas);
}
/**
 * LRU cache of offscreen canvas sprites (bake once, blit many).
 * Entries are asynchronously promoted to GPU-resident ImageBitmap after the
 * first bake, so subsequent blits avoid per-frame texture uploads.
 * Falls back to raw OffscreenCanvas when createImageBitmap is unavailable
 * (Node.js test environment, very old browsers).
 *
 * @param {{ maxItems?: number }} [options]
 */
export function createBakedSpriteCache({ maxItems = 2000 } = {}) {
    const cache = new LruMap(maxItems, {
        onEvict: (key, entry) => {
            disposeEntry(entry);
        },
    });
    return {
        maxItems,
        cache,
        get(key) {
            return cache.get(key) ?? null;
        },
        /**
         * @param {string} key
         * @param {OffscreenCanvas | HTMLCanvasElement} sourceCanvas
         * @param {Record<string, unknown>} [meta]
         */
        set(key, sourceCanvas, meta = {}) {
            const entry = { canvas: sourceCanvas, _isBitmap: false, bakeScale: meta.bakeScale ?? 1, anchorX: meta.anchorX ?? 0, anchorY: meta.anchorY ?? 0, ...meta };
            cache.set(key, entry);
            // Asynchronously promote to a GPU-resident ImageBitmap so that
            // subsequent ctx.drawImage calls are zero-copy.
            createImageBitmap(sourceCanvas)
                .then((bitmap) => {
                    // Only apply if this entry is still the live one in the cache.
                    const live = cache.get(key);
                    if (live === entry) {
                        entry.canvas = bitmap;
                        entry._isBitmap = true;
                        // The OffscreenCanvas is no longer needed — return it to the pool.
                        releaseOffscreenCanvas(sourceCanvas);
                    } else
                        // Entry was already evicted or replaced; discard the bitmap.
                        bitmap.close();
                })
                .catch(() => {
                    // Promotion failed (e.g. canvas was closed). Keep OffscreenCanvas as-is.
                });
            return entry;
        },
        clear() {
            for (const entry of cache.values()) disposeEntry(entry);
            cache.clear();
        },
    };
}
