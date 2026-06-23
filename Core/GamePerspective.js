export const DEFAULT_CAMERA_HEIGHT = 160;
export const DEFAULT_PERSPECTIVE_STRENGTH = 0.2;
/** @typedef {"player" | "viewport"} PerspectiveViewerSource */
/**
 * @typedef {object} PerspectiveConfig
 * @property {number} [cameraHeight]
 * @property {number} [strength]
 * @property {PerspectiveViewerSource} [viewerSource]
 */
export function resolvePerspectiveConfig(definition) {
    const perspective = definition?.perspective;
    return { cameraHeight: perspective?.cameraHeight ?? DEFAULT_CAMERA_HEIGHT, strength: perspective?.strength ?? DEFAULT_PERSPECTIVE_STRENGTH, viewerSource: perspective?.viewerSource ?? "player" };
}
