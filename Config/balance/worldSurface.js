import { gridSettings } from "./grid.js";

/** Engine defaults (tower reference). Override wallHeight / pixelsPerCell in gameDefinition.worldSurface when needed. */
export const worldSurfaceSettings = {
    cellsPerChunk: gridSettings.minCellsPerChunk,
    chunkWorldSize: 128 * gridSettings.cellSize,
    viewPaddingPx: 128,
    viewQueryPadPx: 48,
    maxCachedSurfaces: 5000,
    pixelsPerCell: 16,
    wallHeight: 160,
    wallTextureBleedPx: 1,
    wallSubdivNearPx: 80,
    wallSubdivFarPx: 320,
    groundChunkAnimationsOn: false,
    wallAnimationsOn: false,
    animationBakeMaxFrames: null,
    animationFrameBatchSize: 8,
};
