/** Default collision/render radius when a body omits `radius` (props, pickups, fallbacks). */
export const LIBRARY_DEFAULT_BODY_RADIUS = 8;
/** Default radius for combat humanoids when entity config omits `radius`. */
export const LIBRARY_COMBAT_ACTOR_RADIUS = 8;
/** Offscreen bake diameter for actor kinematics rigs. */
export const LIBRARY_KINEMATICS_PIXEL_SIZE = 32;
/**
 * @param {{ _baseRadius?: number, radius?: number } | null | undefined} body
 * @param {number} [fallback]
 */
export function resolveBodyRadius(body, fallback = LIBRARY_DEFAULT_BODY_RADIUS) {
    if (!body) return fallback;
    return body._baseRadius ?? body.radius ?? fallback;
}
