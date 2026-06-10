import { LIBRARY_DEFAULT_CAMERA_HEIGHT, LIBRARY_DEFAULT_PERSPECTIVE_STRENGTH, LIBRARY_MIN_WORLD_SPAN } from "../Libraries/Spatial/iso/perspectiveDefaults.js";
import { setCameraHeight as setIsoCameraHeight, setPerspectiveStrength as setIsoPerspectiveStrength } from "../Libraries/Spatial/iso/IsometricProjection.js";
/** @typedef {"player" | "viewport"} PerspectiveViewerSource */
/**
 * @typedef {object} PerspectiveConfig
 * @property {number} [cameraHeight]
 * @property {number} [strength] — perspective intensity (BOIDS `PERSPECTIVE_INTENSITY`)
 * @property {PerspectiveViewerSource} [viewerSource]
 */
export const DEFAULT_PERSPECTIVE = { cameraHeight: LIBRARY_DEFAULT_CAMERA_HEIGHT, strength: LIBRARY_DEFAULT_PERSPECTIVE_STRENGTH, viewerSource: "player" };
/** @type {PerspectiveConfig} */
let activePerspective = { ...DEFAULT_PERSPECTIVE };
/** @param {import("./GameDefinitionTypes.js").EngineProfile | null | undefined} definition */
export function resolvePerspectiveConfig(definition) {
    return { ...DEFAULT_PERSPECTIVE, ...definition?.perspective };
}
/**
 * @param {import("./GameDefinitionTypes.js").EngineProfile | null | undefined} definition
 * @returns {PerspectiveConfig}
 */
export function applyGamePerspective(definition) {
    activePerspective = resolvePerspectiveConfig(definition);
    setCameraHeight(activePerspective.cameraHeight);
    setPerspectiveStrength(activePerspective.strength);
    return activePerspective;
}
/**
 * Zoom-scaled structure perspective (walls + roofs).
 * BOIDS: `ratioBase = PERSPECTIVE_INTENSITY / max(10, viewport.width)`.
 * Here: `intensity * referenceSpan / worldSpan` — same inverse-zoom curve, props unchanged.
 *
 * @param {import("../Libraries/Viewport/Viewport.js").Viewport | null | undefined} viewport
 */
export function resolveStructurePerspectiveStrength(viewport) {
    const intensity = activePerspective.strength ?? LIBRARY_DEFAULT_PERSPECTIVE_STRENGTH;
    const halfW = viewport?.halfW ?? 0;
    const halfH = viewport?.halfH ?? 0;
    if (halfW <= 0 || halfH <= 0) return intensity;
    const worldSpan = Math.max(LIBRARY_MIN_WORLD_SPAN, Math.min(halfW, halfH) * 2);
    const referenceSpan = Math.max(LIBRARY_MIN_WORLD_SPAN, (viewport.getVisualRadius?.() ?? worldSpan) * 2);
    return (intensity * referenceSpan) / worldSpan;
}
/** @param {number} cameraHeight */
export function setCameraHeight(cameraHeight) {
    setIsoCameraHeight(cameraHeight);
}
/** @param {number} strength */
export function setPerspectiveStrength(strength) {
    setIsoPerspectiveStrength(strength);
}
