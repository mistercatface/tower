const offscreenCanvasPool = [];
const POOL_MAX = 1000;

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
    if (offscreenCanvasPool.length > 0) {
        const canvas = offscreenCanvasPool.pop();
        if (canvas.width === width && canvas.height === height) {
            canvas.getContext("2d").clearRect(0, 0, width, height);
        } else {
            resizeOffscreenCanvas(canvas, width, height);
        }
        return canvas;
    }
    return createOffscreenCanvas(width, height);
}

/**
 * @param {OffscreenCanvas} canvas
 */
export function releaseOffscreenCanvas(canvas) {
    if (offscreenCanvasPool.length < POOL_MAX) {
        offscreenCanvasPool.push(canvas);
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
