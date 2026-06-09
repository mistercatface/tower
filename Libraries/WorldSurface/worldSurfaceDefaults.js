import { gridSettings } from "../../Config/balance/grid.js";
/** @typedef {typeof LIBRARY_WORLD_SURFACE_DEFAULTS} LibraryWorldSurfaceDefaults */
/** Library baseline — games override via `gameDefinition.worldSurface` (+ proceduralDesign for animation bakes). */
export const LIBRARY_WORLD_SURFACE_DEFAULTS = {
    cellsPerChunk: gridSettings.minCellsPerChunk,
    chunkWorldSize: 64 * gridSettings.cellSize,
    viewPaddingPx: 128,
    viewQueryPadPx: 48,
    maxCachedSurfaces: 10000,
    pixelsPerCell: 16,
    wallHeight: 150,
    wallTextureBleedPx: 1,
    wallSubdivNearPx: 80,
    wallSubdivFarPx: 320,
    floorShadow: "#12161c",
    bloom: { enabled: false, blur: 2 },
    groundChunkAnimationsOn: false,
    wallAnimationsOn: false,
    animationBakeMaxFrames: null,
    animationFrameBatchSize: 8,
};
