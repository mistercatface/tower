import { getSurfaceProfileRevision } from "./SurfaceProfileRevision.js";
import { TileSurfaceWorkerClient } from "./TileSurfaceWorkerClient.js";
/** @type {TileSurfaceWorkerClient | null} */
let client = null;
let pendingFocusX = 0;
let pendingFocusY = 0;
const EMPTY_STATS = { queueSize: 0, pendingCount: 0, inFlightDedupeCount: 0, busyWorkers: 0 };
/**
 * @param {{ workerUrl: URL | string }} config — game injects Render/WorldSurface/TileWorkerEntry.js
 */
export function configureTileWorkerCoordinator({ workerUrl }) {
    client = new TileSurfaceWorkerClient(workerUrl);
    client.updateFocus(pendingFocusX, pendingFocusY);
}
export function getProfileRevision(profileId) {
    return getSurfaceProfileRevision(profileId);
}
function requireClient() {
    if (!client) throw new Error("TileWorkerCoordinator requires configureTileWorkerCoordinator({ workerUrl }) from game bootstrap");
    return client;
}
export const TileWorkerCoordinator = {
    updateFocus(x, y) {
        pendingFocusX = x;
        pendingFocusY = y;
        client?.updateFocus(x, y);
    },
    getProfileRevision(profileId) {
        return getProfileRevision(profileId);
    },
    bakeSchedulerStats() {
        return client?.stats() ?? EMPTY_STATS;
    },
    requestGroundChunkBake(payload) {
        return requireClient().requestGroundChunkBake(payload);
    },
    requestWallAtlasBake(payload) {
        return requireClient().requestWallAtlasBake(payload);
    },
    requestHorizontalPatchBake(payload) {
        return requireClient().requestHorizontalPatchBake(payload);
    },
    registerRuntimeProfile(profileId, profile) {
        return requireClient().registerRuntimeProfile(profileId, profile);
    },
    syncBakeConstants(settings) {
        return requireClient().syncBakeConstants(settings);
    },
    shutdown() {
        client?.shutdown();
    },
};
