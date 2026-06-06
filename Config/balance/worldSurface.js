import { gridSettings } from "./grid.js";

/** Ground/wall/roof procedural world-surface rendering. */
export const worldSurfaceSettings = {
    cellsPerChunk: gridSettings.minCellsPerChunk,
    tileResolution: 6,
    tileWorldSize: gridSettings.cellSize,
    chunkWorldSize: 128 * gridSettings.cellSize,
    viewPaddingPx: 128,
    viewQueryPadPx: 48,
    maxCachedSurfaces: 5000,
    /** null = cameraHeight − wallHeightInset (tower default). */
    wallVisualHeight: null,
    wallHeightInset: 10,
    wallTextureStories: 5,
    wallTextureBleedPx: 1,
    wallSubdivNearPx: 80,
    wallSubdivFarPx: 320,
    groundChunkAnimationsOn: false,
    wallAnimationsOn: false,
    animationBakeMaxFrames: null,
    animationFrameBatchSize: 8,
};
