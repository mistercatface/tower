import { installGameWorldSurfaceSettings } from "../Render/WorldSurfaceBootstrap.js";
import { setCameraHeight, setPerspectiveStrength } from "../Libraries/Spatial/iso/IsometricProjection.js";

/** @typedef {"player" | "viewport"} PerspectiveViewerSource */

/**
 * @typedef {object} PerspectiveConfig
 * @property {number} [cameraHeight] — higher = flatter table (less radial extrusion). Default 160.
 * @property {number} [strength] — 0–1+ scale on vertical warp. Default 1.
 * @property {PerspectiveViewerSource} [viewerSource] — warp origin for iso props/walls. Default "player".
 */

export const DEFAULT_PERSPECTIVE = {
    cameraHeight: 160,
    strength: 1,
    viewerSource: "player",
};

/** @param {import("./GameDefinitionTypes.js").GameDefinition | null | undefined} definition */
export function resolvePerspectiveConfig(definition) {
    return { ...DEFAULT_PERSPECTIVE, ...definition?.perspective };
}

/** @param {import("./GameDefinitionTypes.js").GameDefinition} definition */
export function applyGamePerspective(definition) {
    const config = resolvePerspectiveConfig(definition);
    setCameraHeight(config.cameraHeight);
    setPerspectiveStrength(config.strength);
    installGameWorldSurfaceSettings({ cameraHeight: config.cameraHeight });
}
