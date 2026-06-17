import { gridSettings, WORLD_SURFACE_DEFAULTS, worldSpanPx } from "../Config/world.js";
import { CAMERA_HEIGHT } from "../Libraries/Spatial/iso/IsometricProjection.js";
import { createWorldSurfaceSettings } from "../Libraries/WorldSurface/WorldSurfaceSettings.js";
/** @type {import("../Libraries/WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings | null} */
let gameWorldSurfaceSettings = null;
const surfaceDefaults = WORLD_SURFACE_DEFAULTS;
function resolveWallSurface(overrides, cellSize) {
    const wallHeightCells = overrides.wallHeightCells ?? surfaceDefaults.wallHeightCells;
    const wallHeight = wallHeightCells * cellSize;
    return { wallHeight, wallHeightCells, roofZLevels: [wallHeight] };
}
export function createGameWorldSurfaceSettings(overrides = {}) {
    const cameraHeight = overrides.cameraHeight ?? CAMERA_HEIGHT;
    const cellSize = overrides.cellSize ?? gridSettings.cellSize;
    const surfaceBakeScale = overrides.surfaceBakeScale ?? surfaceDefaults.surfaceBakeScale;
    const wallSurface = resolveWallSurface(overrides, cellSize);
    const chunkWorldSpanCells = overrides.chunkWorldSpanCells ?? surfaceDefaults.chunkWorldSpanCells;
    return createWorldSurfaceSettings({
        cellsPerChunk: surfaceDefaults.cellsPerChunk,
        chunkWorldSize: worldSpanPx(chunkWorldSpanCells, cellSize),
        viewPaddingPx: surfaceDefaults.viewPaddingPx,
        viewQueryPadPx: surfaceDefaults.viewQueryPadPx,
        maxCachedSurfaces: surfaceDefaults.maxCachedSurfaces,
        wallHeight: wallSurface.wallHeight,
        maxWallHeightLevel: overrides.maxWallHeightLevel ?? surfaceDefaults.maxWallHeightLevel,
        wallHeightCells: wallSurface.wallHeightCells,
        surfaceBakeScale,
        wallTextureBleedPx: surfaceDefaults.wallTextureBleedPx,
        wallSubdivNearPx: surfaceDefaults.wallSubdivNearPx,
        wallSubdivFarPx: surfaceDefaults.wallSubdivFarPx,
        animationBakeMaxFrames: overrides.animationBakeMaxFrames ?? surfaceDefaults.animationBakeMaxFrames,
        roofZLevels: wallSurface.roofZLevels,
        cellSize,
        cameraHeight,
        floorShadow: overrides.floorShadow ?? surfaceDefaults.floorShadow,
    });
}
/** @returns {import("../Libraries/WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings} */
export function getGameWorldSurfaceSettings() {
    if (!gameWorldSurfaceSettings) gameWorldSurfaceSettings = createGameWorldSurfaceSettings();
    return gameWorldSurfaceSettings;
}
/** @param {Parameters<typeof createGameWorldSurfaceSettings>[0]} [overrides] */
export function installGameWorldSurfaceSettings(overrides) {
    gameWorldSurfaceSettings = createGameWorldSurfaceSettings(overrides);
}
export const TILE_WORKER_URL = new URL("./WorldSurface/TileWorkerEntry.js", import.meta.url);
export const FLOW_FIELD_WORKER_URL = new URL("../Libraries/Workers/Navigation/FlowFieldWorkerEntry.js", import.meta.url);
export const HPA_WORKER_URL = new URL("../Libraries/Workers/Navigation/HpaWorkerEntry.js", import.meta.url);
