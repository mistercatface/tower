import { LIBRARY_DEFAULT_CAMERA_HEIGHT, LIBRARY_DEFAULT_PERSPECTIVE_STRENGTH, LIBRARY_MIN_WORLD_SPAN } from "../Libraries/Spatial/iso/perspectiveDefaults.js";
/** @typedef {"player" | "viewport"} PerspectiveViewerSource */
/**
 * @typedef {object} PerspectiveConfig
 * @property {number} [cameraHeight]
 * @property {number} [strength] — perspective intensity (BOIDS `PERSPECTIVE_INTENSITY`)
 * @property {PerspectiveViewerSource} [viewerSource]
 */
export const DEFAULT_PERSPECTIVE = { cameraHeight: LIBRARY_DEFAULT_CAMERA_HEIGHT, strength: LIBRARY_DEFAULT_PERSPECTIVE_STRENGTH, viewerSource: "player" };
export const activePerspective = { ...DEFAULT_PERSPECTIVE };
export let perspectiveConfigGeneration = 0;
/** @param {import("./GameDefinitionTypes.js").EngineProfile | null | undefined} definition */
export function resolvePerspectiveConfig(definition) {
    return { ...DEFAULT_PERSPECTIVE, ...definition?.perspective };
}
export function bumpPerspectiveConfigGeneration() {
    perspectiveConfigGeneration++;
}
/**
 * Zoom-scaled structure perspective (walls + roofs). Cached on viewport until pan/zoom or perspective config changes.
 *
 * @param {import("../Libraries/Viewport/Viewport.js").Viewport} viewport
 */
export function resolveStructurePerspectiveStrength(viewport) {
    if (viewport.structurePerspectiveStrength !== undefined && viewport._structurePerspectiveConfigGen === perspectiveConfigGeneration) return viewport.structurePerspectiveStrength;
    const intensity = activePerspective.strength;
    const worldSpan = viewport.structurePerspectiveWorldSpan ?? Math.max(LIBRARY_MIN_WORLD_SPAN, Math.min(viewport.halfW, viewport.halfH) * 2);
    const referenceSpan = viewport.structurePerspectiveReferenceSpan ?? Math.max(LIBRARY_MIN_WORLD_SPAN, viewport.getVisualRadius() * 2);
    viewport._structurePerspectiveConfigGen = perspectiveConfigGeneration;
    viewport.structurePerspectiveStrength = (intensity * referenceSpan) / worldSpan;
    return viewport.structurePerspectiveStrength;
}
