import { LruMap } from "../DataStructures/LruMap.js";
import { releaseOffscreenCanvas } from "./offscreenCanvas.js";
/**
 * LRU cache of offscreen canvas sprites (bake once, blit many).
 * Used by kinematics bodies and iso props; animation frame buckets plug into caller keys.
 *
 * @param {{ maxItems?: number }} [options]
 */
export function createBakedSpriteCache({ maxItems = 2000 } = {}) {
    const cache = new LruMap(maxItems, {
        onEvict: (key, canvas) => {
            releaseOffscreenCanvas(canvas);
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
         * @param {Record<string, unknown>} [meta] — copied onto the cached canvas (anchorX, anchorY, drawRatio, …)
         */
        set(key, sourceCanvas, meta = {}) {
            for (const [field, value] of Object.entries(meta)) sourceCanvas[field] = value;
            cache.set(key, sourceCanvas);
            return sourceCanvas;
        },
        clear() {
            for (const canvas of cache.values()) releaseOffscreenCanvas(canvas);
            cache.clear();
        },
    };
}
