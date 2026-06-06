import { worldSurfaceSettings, gridSettings } from "../Config/Config.js";
import { CAMERA_HEIGHT } from "../Libraries/Spatial/iso/IsometricProjection.js";
import { createWorldSurfaceSettings } from "../Libraries/WorldSurface/WorldSurfaceSettings.js";

/** @type {import("../Libraries/WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings | null} */
let gameWorldSurfaceSettings = null;

function resolveWallSurface(overrides, cellSize) {
    const wallHeight = overrides.wallHeight ?? worldSurfaceSettings.wallHeight;
    if (wallHeight == null) {
        throw new Error("worldSurface.wallHeight must be set in game config or worldSurfaceSettings");
    }
    return { wallHeight, wallHeightCells: wallHeight / cellSize, roofZLevels: [wallHeight] };
}

export function createGameWorldSurfaceSettings(overrides = {}) {
    const cameraHeight = overrides.cameraHeight ?? CAMERA_HEIGHT;
    const cellSize = overrides.cellSize ?? gridSettings.cellSize;
    const pixelsPerCell = overrides.pixelsPerCell ?? worldSurfaceSettings.pixelsPerCell;
    const texelResolution = pixelsPerCell / cellSize;
    const wallSurface = resolveWallSurface(overrides, cellSize);
    return createWorldSurfaceSettings({
        cellsPerChunk: worldSurfaceSettings.cellsPerChunk,
        chunkWorldSize: worldSurfaceSettings.chunkWorldSize,
        viewPaddingPx: worldSurfaceSettings.viewPaddingPx,
        viewQueryPadPx: worldSurfaceSettings.viewQueryPadPx,
        maxCachedSurfaces: worldSurfaceSettings.maxCachedSurfaces,
        pixelsPerCell,
        wallHeight: wallSurface.wallHeight,
        wallHeightCells: wallSurface.wallHeightCells,
        texelResolution,
        wallTextureBleedPx: worldSurfaceSettings.wallTextureBleedPx,
        wallSubdivNearPx: worldSurfaceSettings.wallSubdivNearPx,
        wallSubdivFarPx: worldSurfaceSettings.wallSubdivFarPx,
        groundChunkAnimationsOn: overrides.groundChunkAnimationsOn ?? worldSurfaceSettings.groundChunkAnimationsOn,
        wallAnimationsOn: overrides.wallAnimationsOn ?? worldSurfaceSettings.wallAnimationsOn,
        animationBakeMaxFrames: overrides.animationBakeMaxFrames ?? worldSurfaceSettings.animationBakeMaxFrames,
        animationFrameBatchSize: overrides.animationFrameBatchSize ?? worldSurfaceSettings.animationFrameBatchSize,
        roofZLevels: wallSurface.roofZLevels,
        cellSize,
        cameraHeight,
        floorShadow: overrides.floorShadow ?? worldSurfaceSettings.floorShadow,
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
export const FLOW_FIELD_WORKER_URL = new URL("./Navigation/FlowFieldWorkerEntry.js", import.meta.url);
