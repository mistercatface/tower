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
/**
 * @param {{ minZoom: number, maxZoom: number, step?: number, formatLabel?: (zoom: number) => string }} opts
 */
export function normalizedZoomMapping({ minZoom, maxZoom, step = 1, formatLabel = (z) => `${Math.round(z * 100)}%` }) {
    const span = maxZoom - minZoom;
    return { min: 0, max: 100, step, zoomToSlider: (zoom) => ((zoom - minZoom) / span) * 100, sliderToZoom: (sliderVal) => minZoom + (sliderVal / 100) * span, formatLabel };
}
