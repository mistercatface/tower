import { createGameWorldSurfaceSettings } from "../../Render/WorldSurfaceBootstrap.js";
import { WorldSurfaceEngine } from "../../Libraries/WorldSurface/worldSurface.js";
import { cellIdxToChunkKey, packChunkKey } from "../../Libraries/Spatial/spatial.js";

export function createRealWorldSurfaces(activeSurfaceProfileId = "base") {
    const settings = createGameWorldSurfaceSettings();
    const engine = new WorldSurfaceEngine(settings);
    engine.activeSurfaceProfileId = activeSurfaceProfileId;
    return engine;
}

export function seedStaticRoofCacheKeys(engine, obstacleGrid, cellIdx, zLevel) {
    const cellsPerChunk = engine.settings.cellsPerChunk;
    const chunkKey = cellIdxToChunkKey(cellIdx, obstacleGrid, cellsPerChunk);
    const profileId = engine.activeSurfaceProfileId;
    const maskKey = engine.cacheKeys.staticRoofMaskKey(chunkKey, zLevel);
    const drawKey = engine.cacheKeys.staticRoofDrawKey(chunkKey, profileId, zLevel);
    engine.surfaceCache.set(maskKey, { seeded: true });
    engine.surfaceCache.set(drawKey, { seeded: true });
    return { chunkKey, maskKey, drawKey, profileId };
}

export { packChunkKey, cellIdxToChunkKey };
