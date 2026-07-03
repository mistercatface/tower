import { LruMap } from "../DataStructures/LruMap.js";
import { releaseOffscreenCanvas } from "./offscreenCanvas.js";
/**
 * LRU cache of offscreen canvas sprites (bake once, blit many).
 * Used by kinematics bodies and radial-elevation props; animation frame buckets plug into caller keys.
 *
 * @param {{ maxItems?: number }} [options]
 */
export function createBakedSpriteCache({ maxItems = 2000 } = {}) {
    const cache = new LruMap(maxItems, {
        onEvict: (key, entry) => {
            releaseOffscreenCanvas(entry.canvas);
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
            const entry = { canvas: sourceCanvas, bakeScale: meta.bakeScale ?? 1, anchorX: meta.anchorX ?? 0, anchorY: meta.anchorY ?? 0, ...meta };
            cache.set(key, entry);
            return entry;
        },
        clear() {
            for (const entry of cache.values()) releaseOffscreenCanvas(entry.canvas);
            cache.clear();
        },
    };
}
