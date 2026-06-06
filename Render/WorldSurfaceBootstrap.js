import { combatVisualSettings, worldSurfaceSettings, gridSettings } from "../Config/Config.js";
import { CAMERA_HEIGHT } from "../Libraries/Spatial/iso/IsometricProjection.js";
import { createWorldSurfaceSettings } from "../Libraries/WorldSurface/WorldSurfaceSettings.js";
import { configureTileWorkerCoordinator } from "../Libraries/WorldSurface/TileWorkerCoordinator.js";

/** @type {import("../Libraries/WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings | null} */
let gameWorldSurfaceSettings = null;

/**
 * Build world-surface settings from game config.
 * @param {{ cameraHeight?: number, wallVisualHeight?: number|null, floorShadow?: string, cellSize?: number, groundChunkAnimationsOn?: boolean, wallAnimationsOn?: boolean, animationBakeMaxFrames?: number|null, animationFrameBatchSize?: number }} [overrides]
 * @returns {import("../Libraries/WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings}
 */
function resolveRoofZLevels(overrides) {
    const wallVisualHeight = overrides.wallVisualHeight ?? worldSurfaceSettings.wallVisualHeight;
    if (wallVisualHeight == null) {
        throw new Error("worldSurface.wallVisualHeight must be set in game config or worldSurfaceSettings");
    }
    return [wallVisualHeight];
}

export function createGameWorldSurfaceSettings(overrides = {}) {
    const cameraHeight = overrides.cameraHeight ?? CAMERA_HEIGHT;
    const wallVisualHeight = overrides.wallVisualHeight ?? worldSurfaceSettings.wallVisualHeight;

    return createWorldSurfaceSettings({
        cellsPerChunk: worldSurfaceSettings.cellsPerChunk,
        tileResolution: worldSurfaceSettings.tileResolution,
        tileWorldSize: worldSurfaceSettings.tileWorldSize,
        chunkWorldSize: worldSurfaceSettings.chunkWorldSize,
        viewPaddingPx: worldSurfaceSettings.viewPaddingPx,
        viewQueryPadPx: worldSurfaceSettings.viewQueryPadPx,
        maxCachedSurfaces: worldSurfaceSettings.maxCachedSurfaces,
        wallVisualHeight,
        wallTextureStories: worldSurfaceSettings.wallTextureStories,
        wallTextureBleedPx: worldSurfaceSettings.wallTextureBleedPx,
        wallSubdivNearPx: worldSurfaceSettings.wallSubdivNearPx,
        wallSubdivFarPx: worldSurfaceSettings.wallSubdivFarPx,
        groundChunkAnimationsOn: overrides.groundChunkAnimationsOn ?? worldSurfaceSettings.groundChunkAnimationsOn,
        wallAnimationsOn: overrides.wallAnimationsOn ?? worldSurfaceSettings.wallAnimationsOn,
        animationBakeMaxFrames: overrides.animationBakeMaxFrames ?? worldSurfaceSettings.animationBakeMaxFrames,
        animationFrameBatchSize: overrides.animationFrameBatchSize ?? worldSurfaceSettings.animationFrameBatchSize,
        roofZLevels: resolveRoofZLevels(overrides),
        cellSize: overrides.cellSize ?? gridSettings.cellSize,
        cameraHeight,
        floorShadow: overrides.floorShadow ?? combatVisualSettings.floorShadow,
    });
}

/** @returns {import("../Libraries/WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings} */
export function getGameWorldSurfaceSettings() {
    if (!gameWorldSurfaceSettings) {
        throw new Error("World surface settings not installed — import Render/WorldSurfaceBootstrap.js at startup");
    }
    return gameWorldSurfaceSettings;
}

/** @param {Parameters<typeof createGameWorldSurfaceSettings>[0]} [overrides] */
export function installGameWorldSurfaceSettings(overrides) {
    gameWorldSurfaceSettings = createGameWorldSurfaceSettings(overrides);
}

export const TILE_WORKER_URL = new URL("./WorldSurface/TileWorkerEntry.js", import.meta.url);
export const FLOW_FIELD_WORKER_URL = new URL("./Navigation/FlowFieldWorkerEntry.js", import.meta.url);

installGameWorldSurfaceSettings();
configureTileWorkerCoordinator({ workerUrl: TILE_WORKER_URL });
