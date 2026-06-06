export function lerp(a, b, t) {
    return a + (b - a) * t;
}
export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
export function radiusAtT(baseRadius, topRadius, t) {
    return lerp(baseRadius, topRadius, t);
}
export function scaleAtHeight(baseSize, alpha, t) {
    return baseSize * (1 + alpha * t);
}
/** Map normalized vertical band coords (0–1) to model-space Y. */
export function labelBandYRange(halfExtent, y0, y1) {
    return { yBot: -halfExtent + halfExtent * 2 * y0, yTop: -halfExtent + halfExtent * 2 * y1 };
}
