/** Default collision/render radius when a body omits `radius`. */
export const LIBRARY_DEFAULT_BODY_RADIUS = 8;
/** Default offscreen bake diameter for iso prop sprites. */
export const LIBRARY_DEFAULT_BAKE_PIXEL_SIZE = 32;
/**
 * @param {{ _baseRadius?: number, radius?: number } | null | undefined} body
 * @param {number} [fallback]
 */
export function resolveBodyRadius(body, fallback = LIBRARY_DEFAULT_BODY_RADIUS) {
    if (!body) return fallback;
    const shape = body.shape;
    if (shape?.type === "Circle") return shape.radius;
    return body._baseRadius ?? body.radius ?? fallback;
}
