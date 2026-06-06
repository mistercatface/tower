import { getGameWorldSurfaceSettings, installGameWorldSurfaceSettings } from "../Render/WorldSurfaceBootstrap.js";
import { setCameraHeight, setPerspectiveStrength } from "../Libraries/Spatial/iso/IsometricProjection.js";
import { state } from "../GameState/GameState.js";
import { resolveProceduralAnimationSettings, resolveProceduralBakeSettings } from "./GameProceduralDesign.js";

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
    installGameWorldSurfaceSettings({
        cameraHeight: config.cameraHeight,
        wallVisualHeight: definition?.worldSurface?.wallVisualHeight,
        ...resolveProceduralAnimationSettings(definition),
        ...resolveProceduralBakeSettings(definition),
    });
    syncWorldSurfaceEngineSettings();
}

/** Push installed world-surface settings onto the live bake cache (constructed before game bootstrap). */
export function syncWorldSurfaceEngineSettings() {
    const engine = state.worldSurfaces;
    if (!engine) return;

    const settings = getGameWorldSurfaceSettings();
    const prev = engine.settings;
    const bakeSettingsChanged =
        prev.groundChunkAnimationsOn !== settings.groundChunkAnimationsOn
        || prev.wallAnimationsOn !== settings.wallAnimationsOn
        || prev.animationBakeMaxFrames !== settings.animationBakeMaxFrames
        || prev.animationFrameBatchSize !== settings.animationFrameBatchSize
        || prev.wallVisualHeight !== settings.wallVisualHeight
        || prev.cameraHeight !== settings.cameraHeight
        || JSON.stringify(prev.roofZLevels ?? []) !== JSON.stringify(settings.roofZLevels ?? []);

    engine.settings = settings;
    if (bakeSettingsChanged) {
        engine.clear();
    }
}
