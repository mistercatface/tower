const offscreenCanvasPool = new Map();
let poolCount = 0;
const POOL_MAX = 4096;
/**
 * Offscreen bake surfaces. Policy: `imageSmoothingEnabled` false at birth (and after resize).
 * Returns the canvas only — no wrapper object. Callers cache `getContext("2d")` locally if they need it.
 */
/** @param {number} width @param {number} height @returns {OffscreenCanvas} */
export function createOffscreenCanvas(width, height) {
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext("2d").imageSmoothingEnabled = false;
    return canvas;
}
/**
 * @param {number} width
 * @param {number} height
 * @returns {OffscreenCanvas}
 */
export function acquireOffscreenCanvas(width, height) {
    const key = (width << 16) | height;
    const list = offscreenCanvasPool.get(key);
    if (list && list.length > 0) {
        poolCount--;
        const canvas = list.pop();
        canvas.getContext("2d").clearRect(0, 0, width, height);
        return canvas;
    }
    return createOffscreenCanvas(width, height);
}
/**
 * @param {OffscreenCanvas} canvas
 */
export function releaseOffscreenCanvas(canvas) {
    if (poolCount < POOL_MAX) {
        const key = (canvas.width << 16) | canvas.height;
        let list = offscreenCanvasPool.get(key);
        if (!list) {
            list = [];
            offscreenCanvasPool.set(key, list);
        }
        list.push(canvas);
        poolCount++;
    }
}
/**
 * @param {OffscreenCanvas} canvas
 * @param {number} width
 * @param {number} height
 */
export function resizeOffscreenCanvas(canvas, width, height) {
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").imageSmoothingEnabled = false;
}
