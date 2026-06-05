import { gridSettings } from "./grid.js";

/** Floor/wall/roof procedural surface rendering. */
export const floorTileSettings = {
    cellsPerChunk: gridSettings.minCellsPerChunk,
    tileResolution: 6,
    tileWorldSize: gridSettings.cellSize,
    chunkWorldSize: 128 * gridSettings.cellSize,
    viewPaddingPx: 128,
    viewQueryPadPx: 48,
    maxCachedSurfaces: 5000,
    wallVisualHeight: null,
    wallHeightInset: 10,
    wallTextureStories: 5,
    wallTextureBleedPx: 1,
    wallSubdivNearPx: 80,
    wallSubdivFarPx: 320,
    floorAnimationsOn: false,
    wallAnimationsOn: false,
};

export function resolveWallVisualHeight(cameraHeight, settings = floorTileSettings) {
    return settings.wallVisualHeight ?? (cameraHeight - settings.wallHeightInset);
}
