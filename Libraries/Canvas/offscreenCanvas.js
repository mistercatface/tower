/**
 * Offscreen bake surfaces. Policy: `imageSmoothingEnabled` false at birth (and after resize).
 * Returns the canvas only — no wrapper object. Callers that need 2d: `canvas.getContext("2d")` once and cache.
 */
/** @param {number} width @param {number} height @returns {OffscreenCanvas} */
export function createOffscreenCanvas(width, height) {
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext("2d").imageSmoothingEnabled = false;
    return canvas;
}
/**
 * Resize a reused offscreen buffer. Dimension change resets context state, so smoothing is re-applied.
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
