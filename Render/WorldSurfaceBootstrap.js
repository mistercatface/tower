import { gridSettings, WORLD_SURFACE_DEFAULTS, worldSpanPx } from "../Config/world.js";
const surfaceDefaults = WORLD_SURFACE_DEFAULTS;
function resolveWallSurface(overrides, cellSize) {
    const wallHeightCells = overrides.wallHeightCells ?? surfaceDefaults.wallHeightCells;
    const capPx = wallHeightCells * cellSize;
    return { wallHeightCells, roofZLevels: [capPx] };
}
function resolveSurfaceTilePeriodCells(overrides) {
    const surfaceTilePeriodCells = overrides.surfaceTilePeriodCells ?? surfaceDefaults.surfaceTilePeriodCells;
    const cellsPerChunk = gridSettings.minCellsPerChunk;
    if (surfaceTilePeriodCells % cellsPerChunk !== 0) throw new Error(`surfaceTilePeriodCells must be divisible by cellsPerChunk (${cellsPerChunk})`);
    return surfaceTilePeriodCells;
}
export function createGameWorldSurfaceSettings(overrides = {}) {
    const cellSize = overrides.cellSize ?? gridSettings.cellSize;
    const surfaceBakeScale = overrides.surfaceBakeScale ?? surfaceDefaults.surfaceBakeScale;
    const wallSurface = resolveWallSurface(overrides, cellSize);
    const surfaceTilePeriodCells = resolveSurfaceTilePeriodCells(overrides);
    return {
        cellsPerChunk: gridSettings.minCellsPerChunk,
        surfaceTilePeriodCells,
        surfaceTilePeriodPx: worldSpanPx(surfaceTilePeriodCells, cellSize),
        viewPaddingPx: surfaceDefaults.viewPaddingPx,
        viewQueryPadPx: surfaceDefaults.viewQueryPadPx,
        maxCachedSurfaces: surfaceDefaults.maxCachedSurfaces,
        maxWallHeightLevel: overrides.maxWallHeightLevel ?? surfaceDefaults.maxWallHeightLevel,
        wallHeightCells: wallSurface.wallHeightCells,
        surfaceBakeScale,
        wallTextureBleedPx: surfaceDefaults.wallTextureBleedPx,
        wallSubdivNearPx: surfaceDefaults.wallSubdivNearPx,
        wallSubdivFarPx: surfaceDefaults.wallSubdivFarPx,
        animationBakeMaxFrames: overrides.animationBakeMaxFrames ?? surfaceDefaults.animationBakeMaxFrames,
        roofZLevels: wallSurface.roofZLevels,
        cellSize,
        floorShadow: overrides.floorShadow ?? surfaceDefaults.floorShadow,
    };
}
export let gameWorldSurfaceSettings = createGameWorldSurfaceSettings();
export function replaceGameWorldSurfaceSettings(overrides = {}) {
    gameWorldSurfaceSettings = createGameWorldSurfaceSettings(overrides);
}
export const TILE_WORKER_URL = new URL("./WorldSurface/TileWorkerEntry.js", import.meta.url);
export const FLOW_FIELD_WORKER_URL = new URL("../Libraries/Navigation/FlowFieldWorkerEntry.js", import.meta.url);
export const HPA_WORKER_URL = new URL("../Libraries/Navigation/HpaWorkerEntry.js", import.meta.url);
