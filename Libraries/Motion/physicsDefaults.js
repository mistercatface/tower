/** Library baseline — games override via `gameDefinition.physicsSettings`. */
/** @typedef {typeof LIBRARY_PHYSICS_DEFAULTS} LibraryPhysicsSettings */
export const LIBRARY_PHYSICS_DEFAULTS = {
    groundNavRoll: { maxSpeed: 180, accel: 600, stopRadius: 6 },
    groundNavHpa: { stopRadius: 8, pathWaypointArrivalMin: 12, pathWaypointArrivalRadiusFactor: 1.5 },
};
export const physicsSettings = structuredClone(LIBRARY_PHYSICS_DEFAULTS);

/** Default collision/render radius when a body omits `radius`. */
export const LIBRARY_DEFAULT_BODY_RADIUS = 8;
/** Default offscreen bake diameter for radial-elevation prop sprites. */
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
