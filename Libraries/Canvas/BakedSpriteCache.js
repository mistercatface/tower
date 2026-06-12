import { LruMap } from "../DataStructures/LruMap.js";
import { createOffscreenCanvas } from "./offscreenCanvas.js";
/**
 * LRU cache of offscreen canvas sprites (bake once, blit many).
 * Used by kinematics bodies and iso props; animation frame buckets plug into caller keys.
 *
 * @param {{ maxItems?: number }} [options]
 */
export function createBakedSpriteCache({ maxItems = 2000 } = {}) {
    const cache = new LruMap(maxItems);
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
            const copy = createOffscreenCanvas(sourceCanvas.width, sourceCanvas.height);
            copy.getContext("2d").drawImage(sourceCanvas, 0, 0);
            for (const [field, value] of Object.entries(meta)) copy[field] = value;
            cache.set(key, copy);
            return copy;
        },
        clear() {
            cache.clear();
        },
    };
}
