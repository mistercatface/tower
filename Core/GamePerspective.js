import { LIBRARY_DEFAULT_CAMERA_HEIGHT, LIBRARY_DEFAULT_PERSPECTIVE_STRENGTH } from "../Libraries/Spatial/iso/perspectiveDefaults.js";
import { setCameraHeight as setIsoCameraHeight, setPerspectiveStrength as setIsoPerspectiveStrength } from "../Libraries/Spatial/iso/IsometricProjection.js";
/** @typedef {"player" | "viewport"} PerspectiveViewerSource */
/**
 * @typedef {object} PerspectiveConfig
 * @property {number} [cameraHeight]
 * @property {number} [strength]
 * @property {PerspectiveViewerSource} [viewerSource]
 */
export const DEFAULT_PERSPECTIVE = { cameraHeight: LIBRARY_DEFAULT_CAMERA_HEIGHT, strength: LIBRARY_DEFAULT_PERSPECTIVE_STRENGTH, viewerSource: "player" };
/** @param {import("./GameDefinitionTypes.js").GameDefinition | null | undefined} definition */
export function resolvePerspectiveConfig(definition) {
    return { ...DEFAULT_PERSPECTIVE, ...definition?.perspective };
}
/** @param {number} cameraHeight */
export function setCameraHeight(cameraHeight) {
    setIsoCameraHeight(cameraHeight);
}
/** @param {number} strength */
export function setPerspectiveStrength(strength) {
    setIsoPerspectiveStrength(strength);
}
