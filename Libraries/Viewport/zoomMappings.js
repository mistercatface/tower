/**
 * @param {number} min
 * @param {number} max
 * @param {number} zoom
 */
export function clampZoom(min, max, zoom) {
    return Math.min(max, Math.max(min, zoom));
}
/**
 * @param {{ min: number, max: number, step?: number, formatLabel?: (zoom: number) => string }} opts
 */
export function directZoomMapping({ min, max, step = 0.05, formatLabel = (z) => z.toFixed(2) }) {
    return { min, max, step, zoomToSlider: (zoom) => zoom, sliderToZoom: (sliderVal) => clampZoom(min, max, sliderVal), formatLabel };
}
