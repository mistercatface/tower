import { combatVisualSettings, worldSurfaceSettings, gridSettings } from "../Config/Config.js";
import { CAMERA_HEIGHT } from "../Libraries/Spatial/iso/IsometricProjection.js";
import { createWorldSurfaceSettings, installWorldSurfaceSettings } from "../Libraries/WorldSurface/WorldSurfaceSettings.js";

/**
 * Build world-surface settings from game config.
 * @param {{ cameraHeight?: number, floorShadow?: string, cellSize?: number }} [overrides]
 * @returns {import("../Libraries/WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings}
 */
export function createGameWorldSurfaceSettings(overrides = {}) {
    return createWorldSurfaceSettings({
        cellsPerChunk: worldSurfaceSettings.cellsPerChunk,
        tileResolution: worldSurfaceSettings.tileResolution,
        tileWorldSize: worldSurfaceSettings.tileWorldSize,
        chunkWorldSize: worldSurfaceSettings.chunkWorldSize,
        viewPaddingPx: worldSurfaceSettings.viewPaddingPx,
        viewQueryPadPx: worldSurfaceSettings.viewQueryPadPx,
        maxCachedSurfaces: worldSurfaceSettings.maxCachedSurfaces,
        wallVisualHeight: worldSurfaceSettings.wallVisualHeight,
        wallHeightInset: worldSurfaceSettings.wallHeightInset,
        wallTextureStories: worldSurfaceSettings.wallTextureStories,
        wallTextureBleedPx: worldSurfaceSettings.wallTextureBleedPx,
        wallSubdivNearPx: worldSurfaceSettings.wallSubdivNearPx,
        wallSubdivFarPx: worldSurfaceSettings.wallSubdivFarPx,
        groundChunkAnimationsOn: worldSurfaceSettings.groundChunkAnimationsOn,
        wallAnimationsOn: worldSurfaceSettings.wallAnimationsOn,
        cellSize: overrides.cellSize ?? gridSettings.cellSize,
        cameraHeight: overrides.cameraHeight ?? CAMERA_HEIGHT,
        floorShadow: overrides.floorShadow ?? combatVisualSettings.floorShadow,
    });
}

/** @param {Parameters<typeof createGameWorldSurfaceSettings>[0]} [overrides] */
export function installGameWorldSurfaceSettings(overrides) {
    installWorldSurfaceSettings(createGameWorldSurfaceSettings(overrides));
}

installGameWorldSurfaceSettings();
