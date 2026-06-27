import { EMPTY_TILE_BAKE_STATS, TileSurfaceWorkerClient } from "./TileSurfaceWorkerClient.js";
/** @type {TileSurfaceWorkerClient | null} */
let client = null;
/**
 * @param {{ workerUrl: URL | string }} config — game injects Render/WorldSurface/TileWorkerEntry.js
 */
export function configureTileWorkerCoordinator({ workerUrl }) {
    client = new TileSurfaceWorkerClient(workerUrl);
}
function requireClient() {
    if (!client) throw new Error("TileWorkerCoordinator requires configureTileWorkerCoordinator({ workerUrl }) from game bootstrap");
    return client;
}
export const TileWorkerCoordinator = {
    updateFocus(x, y) {
        client?.updateFocus(x, y);
    },
    stats() {
        return client?.stats() ?? EMPTY_TILE_BAKE_STATS;
    },
    enableTileBakeMetrics(enabled = true) {
        return requireClient().enableTileBakeMetrics(enabled);
    },
    requestGroundChunkBake(payload) {
        return requireClient().requestGroundChunkBake(payload);
    },
    requestWallAtlasBake(payload) {
        return requireClient().requestWallAtlasBake(payload);
    },
    registerRuntimeProfile(profileId, profile) {
        return requireClient().registerRuntimeProfile(profileId, profile);
    },
    syncBakeConstants(settings) {
        return requireClient().syncBakeConstants(settings);
    },
};
