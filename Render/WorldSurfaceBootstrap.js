import { combatVisualSettings, floorTileSettings, gridSettings } from "../Config/Config.js";
import { CAMERA_HEIGHT } from "../Libraries/Math/IsometricProjection.js";
import { createWorldSurfaceSettings, installWorldSurfaceSettings } from "../Libraries/WorldSurface/WorldSurfaceSettings.js";

/**
 * Build world-surface settings from game config.
 * @param {{ cameraHeight?: number, floorShadow?: string, cellSize?: number }} [overrides]
 * @returns {import("../Libraries/WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings}
 */
export function createGameWorldSurfaceSettings(overrides = {}) {
    return createWorldSurfaceSettings({
        cellsPerChunk: floorTileSettings.cellsPerChunk,
        tileResolution: floorTileSettings.tileResolution,
        tileWorldSize: floorTileSettings.tileWorldSize,
        chunkWorldSize: floorTileSettings.chunkWorldSize,
        viewPaddingPx: floorTileSettings.viewPaddingPx,
        viewQueryPadPx: floorTileSettings.viewQueryPadPx,
        maxCachedSurfaces: floorTileSettings.maxCachedSurfaces,
        wallVisualHeight: floorTileSettings.wallVisualHeight,
        wallHeightInset: floorTileSettings.wallHeightInset,
        wallTextureStories: floorTileSettings.wallTextureStories,
        wallTextureBleedPx: floorTileSettings.wallTextureBleedPx,
        wallSubdivNearPx: floorTileSettings.wallSubdivNearPx,
        wallSubdivFarPx: floorTileSettings.wallSubdivFarPx,
        floorAnimationsOn: floorTileSettings.floorAnimationsOn,
        wallAnimationsOn: floorTileSettings.wallAnimationsOn,
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
