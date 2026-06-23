import { gridSettings, WORLD_SURFACE_DEFAULTS, worldSpanPx } from "../Config/world.js";
import { createWorldSurfaceSettings } from "../Libraries/WorldSurface/WorldSurfaceSettings.js";
const surfaceDefaults = WORLD_SURFACE_DEFAULTS;
function resolveWallSurface(overrides, cellSize) {
    const wallHeightCells = overrides.wallHeightCells ?? surfaceDefaults.wallHeightCells;
    const capPx = wallHeightCells * cellSize;
    return { wallHeightCells, roofZLevels: [capPx] };
}
export function createGameWorldSurfaceSettings(overrides = {}) {
    const cellSize = overrides.cellSize ?? gridSettings.cellSize;
    const surfaceBakeScale = overrides.surfaceBakeScale ?? surfaceDefaults.surfaceBakeScale;
    const wallSurface = resolveWallSurface(overrides, cellSize);
    const chunkWorldSpanCells = overrides.chunkWorldSpanCells ?? surfaceDefaults.chunkWorldSpanCells;
    return createWorldSurfaceSettings({
        cellsPerChunk: gridSettings.minCellsPerChunk,
        chunkWorldSize: worldSpanPx(chunkWorldSpanCells, cellSize),
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
    });
}
export let gameWorldSurfaceSettings = createGameWorldSurfaceSettings();
export function replaceGameWorldSurfaceSettings(overrides = {}) {
    gameWorldSurfaceSettings = createGameWorldSurfaceSettings(overrides);
}
export const TILE_WORKER_URL = new URL("./WorldSurface/TileWorkerEntry.js", import.meta.url);
export const FLOW_FIELD_WORKER_URL = new URL("../Libraries/Workers/Navigation/FlowFieldWorkerEntry.js", import.meta.url);
export const HPA_WORKER_URL = new URL("../Libraries/Workers/Navigation/HpaWorkerEntry.js", import.meta.url);
