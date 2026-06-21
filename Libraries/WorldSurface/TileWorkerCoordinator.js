import { getSurfaceProfileProvider } from "../Procedural/SurfaceProfileProvider.js";
import { PromiseWorkerPoolHost } from "../Workers/PromiseWorkerPoolHost.js";
import { bumpSurfaceProfileRevision, getSurfaceProfileRevision } from "./SurfaceProfileRevision.js";
import { clampBakeFrameRange, isFirstFrameRange } from "./AnimationFrameBake.js";
import { getAnimationFrames } from "./ProfileBakeResolver.js";
import { TILE_BAKE_TIER, TileBakeScheduler } from "./TileBakeScheduler.js";
import { getSurfaceBakeScale } from "./WorldSurfaceResolution.js";
/** Bakes wait on this chain so runtime profiles reach workers before paint jobs run. */
let workerReady = Promise.resolve();
const registeredRuntimeProfileIds = new Set();
/** @type {PromiseWorkerPoolHost | null} */
let workerPool = null;
/** @type {TileBakeScheduler | null} */
let bakeScheduler = null;
/** @type {URL | string | null} */
let tileWorkerUrl = null;
let pendingFocusX = 0;
let pendingFocusY = 0;
/**
 * @param {{ workerUrl: URL | string }} config — game injects Render/WorldSurface/TileWorkerEntry.js
 */
export function configureTileWorkerCoordinator({ workerUrl }) {
    tileWorkerUrl = workerUrl;
}
export function getProfileRevision(profileId) {
    return getSurfaceProfileRevision(profileId);
}
function whenWorkersReady(run) {
    return Promise.resolve(workerReady).then(run);
}
function ensureBakeScheduler() {
    if (bakeScheduler) return bakeScheduler;
    if (!tileWorkerUrl) throw new Error("TileWorkerCoordinator requires configureTileWorkerCoordinator({ workerUrl }) from game bootstrap");
    workerPool = new PromiseWorkerPoolHost(tileWorkerUrl, { name: "TileSurfaceWorker", onJobComplete: (workerIndex, result) => bakeScheduler.finishJob(workerIndex, result) });
    bakeScheduler = new TileBakeScheduler(workerPool, { getProfileRevision: getSurfaceProfileRevision });
    bakeScheduler.updateFocus(pendingFocusX, pendingFocusY);
    workerPool.ensureStarted();
    return bakeScheduler;
}
function sendRequest(type, payload, tier = TILE_BAKE_TIER.STATIC) {
    ensureBakeScheduler();
    return whenWorkersReady(() => bakeScheduler.enqueue(type, payload, tier));
}
function broadcastRequest(type, payload) {
    return ensureBakeScheduler().broadcast(type, payload);
}
function withBakeFrameRange(payload, profile) {
    const sourceTotal = getAnimationFrames(profile?.animation);
    const bakeTotal = payload.animationBakeFrames ?? sourceTotal;
    const range = clampBakeFrameRange({ frameStart: payload.frameStart, frameCount: payload.frameCount }, bakeTotal);
    return { ...payload, ...range, animationSourceFrames: payload.animationSourceFrames ?? sourceTotal };
}
function requestBake(type, payload, isAnimated) {
    const tier = isAnimated && !isFirstFrameRange(payload) ? TILE_BAKE_TIER.ANIMATION : TILE_BAKE_TIER.STATIC;
    return sendRequest(type, payload, tier);
}
/** Runtime profiles exist on the main thread before workers receive registerRuntimeProfile — gate bakes until synced. */
function ensureRuntimeProfileOnWorkers(profileId) {
    if (!profileId) return whenWorkersReady(() => {});
    const provider = getSurfaceProfileProvider();
    if (provider.listShippedIds().includes(profileId)) return whenWorkersReady(() => {});
    if (!provider.hasProfile(profileId)) return Promise.reject(new Error(`Unknown surface procedural profile: ${profileId}`));
    if (registeredRuntimeProfileIds.has(profileId)) return workerReady;
    return TileWorkerCoordinator.registerRuntimeProfile(profileId, provider.getProfile(profileId));
}
export const TileWorkerCoordinator = {
    updateFocus(x, y) {
        pendingFocusX = x;
        pendingFocusY = y;
        bakeScheduler?.updateFocus(x, y);
    },
    getProfileRevision(profileId) {
        return getProfileRevision(profileId);
    },
    bakeSchedulerStats() {
        return bakeScheduler?.stats() ?? { queueSize: 0, pendingCount: 0, inFlightDedupeCount: 0, busyWorkers: 0 };
    },
    requestGroundChunkBake(payload) {
        const profileId = payload.profileId;
        return ensureRuntimeProfileOnWorkers(profileId).then(() => {
            const profile = getSurfaceProfileProvider().getProfile(profileId);
            const normalized = withBakeFrameRange(payload, profile);
            return sendRequest("bakeGroundChunk", normalized, TILE_BAKE_TIER.STATIC);
        });
    },
    requestWallAtlasBake(payload) {
        const profileId = payload.profileId;
        return ensureRuntimeProfileOnWorkers(profileId).then(() => {
            const profile = getSurfaceProfileProvider().getProfile(profileId);
            const normalized = withBakeFrameRange(payload, profile);
            return sendRequest("bakeWallAtlas", normalized, TILE_BAKE_TIER.STATIC);
        });
    },
    requestHorizontalPatchBake(payload) {
        const profileId = payload.profileId;
        return ensureRuntimeProfileOnWorkers(profileId).then(() => {
            const profile = getSurfaceProfileProvider().getProfile(profileId);
            const normalized = withBakeFrameRange(payload, profile);
            return requestBake("bakeHorizontalPatch", normalized, (normalized.frameCount ?? 1) > 1);
        });
    },
    registerRuntimeProfile(profileId, profile) {
        getSurfaceProfileProvider().registerRuntime(profileId, profile);
        bumpSurfaceProfileRevision(profileId);
        ensureBakeScheduler();
        registeredRuntimeProfileIds.add(profileId);
        workerReady = workerReady.then(() => broadcastRequest("registerRuntimeProfile", { profileId, profile }));
        return workerReady;
    },
    syncBakeConstants(settings) {
        const constants = { cellSize: settings.cellSize, cellsPerChunk: settings.cellsPerChunk, surfaceBakeScale: getSurfaceBakeScale(settings) };
        ensureBakeScheduler();
        workerReady = workerReady.then(() => broadcastRequest("configureBakeConstants", constants));
        return workerReady;
    },
};
