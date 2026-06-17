import { gridSettings } from "../Config/Config.js";
import { CAMERA_HEIGHT } from "../Libraries/Spatial/iso/IsometricProjection.js";
import { LIBRARY_WORLD_SURFACE_DEFAULTS } from "../Libraries/WorldSurface/worldSurfaceDefaults.js";
import { createWorldSurfaceSettings } from "../Libraries/WorldSurface/WorldSurfaceSettings.js";
/** @type {import("../Libraries/WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings | null} */
let gameWorldSurfaceSettings = null;
const surfaceDefaults = LIBRARY_WORLD_SURFACE_DEFAULTS;
function resolveWallSurface(overrides, cellSize) {
    const wallHeight = overrides.wallHeight ?? surfaceDefaults.wallHeight;
    if (wallHeight == null) throw new Error("worldSurface.wallHeight must be set on gameDefinition.worldSurface or library defaults");
    return { wallHeight, wallHeightCells: wallHeight / cellSize, roofZLevels: [wallHeight] };
}
export function createGameWorldSurfaceSettings(overrides = {}) {
    const cameraHeight = overrides.cameraHeight ?? CAMERA_HEIGHT;
    const cellSize = overrides.cellSize ?? gridSettings.cellSize;
    const pixelsPerCell = overrides.pixelsPerCell ?? surfaceDefaults.pixelsPerCell;
    const texelResolution = pixelsPerCell / cellSize;
    const wallSurface = resolveWallSurface(overrides, cellSize);
    return createWorldSurfaceSettings({
        cellsPerChunk: surfaceDefaults.cellsPerChunk,
        chunkWorldSize: surfaceDefaults.chunkWorldSize,
        viewPaddingPx: surfaceDefaults.viewPaddingPx,
        viewQueryPadPx: surfaceDefaults.viewQueryPadPx,
        maxCachedSurfaces: surfaceDefaults.maxCachedSurfaces,
        pixelsPerCell,
        wallHeight: wallSurface.wallHeight,
        maxWallHeightLevel: overrides.maxWallHeightLevel ?? surfaceDefaults.maxWallHeightLevel,
        wallHeightCells: wallSurface.wallHeightCells,
        texelResolution,
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
