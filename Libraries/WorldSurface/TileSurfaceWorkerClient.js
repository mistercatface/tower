import { resolveSurfaceProfile, runtimeSurfaceProfiles, shippedSurfaceProfileIds, surfaceProfileKnown } from "../Procedural/SurfaceProfileProvider.js";
import { PromiseWorkerPoolHost } from "../Workers/PromiseWorkerPoolHost.js";
import { bumpSurfaceProfileRevision, getSurfaceProfileRevision } from "./SurfaceProfileRevision.js";
import { clampBakeFrameRange, isFirstFrameRange } from "./AnimationFrameBake.js";
import { getAnimationFrames } from "./ProfileBakeResolver.js";
import { EMPTY_BAKE_TIMING_STATS, setTileBakeMetricsEnabled } from "./TileBakeMetrics.js";
import { TILE_BAKE_TIER, TileBakeScheduler } from "./TileBakeScheduler.js";
import { TILE_WORKER_MESSAGE } from "./TileWorkerMessages.js";
export const EMPTY_TILE_BAKE_STATS = { queueSize: 0, pendingCount: 0, inFlightDedupeCount: 0, busyWorkers: 0, bakeTiming: { ...EMPTY_BAKE_TIMING_STATS } };
function withBakeFrameRange(payload, profile) {
    const sourceTotal = getAnimationFrames(profile?.animation);
    const bakeTotal = payload.animationBakeFrames ?? sourceTotal;
    const range = clampBakeFrameRange({ frameStart: payload.frameStart, frameCount: payload.frameCount }, bakeTotal);
    return { ...payload, ...range, animationSourceFrames: payload.animationSourceFrames ?? sourceTotal };
}
/**
 * Main-thread tile surface bake client — pool, scheduler, profile sync, and request API.
 */
export class TileSurfaceWorkerClient {
    constructor(workerUrl, options = {}) {
        this.workerUrl = workerUrl;
        this.workerReady = Promise.resolve();
        this.registeredRuntimeProfileIds = new Set();
        this.pendingFocusX = 0;
        this.pendingFocusY = 0;
        this._started = false;
        if (options.pool && options.scheduler) {
            this.pool = options.pool;
            this.scheduler = options.scheduler;
        } else {
            this.pool = new PromiseWorkerPoolHost(workerUrl, { name: "TileSurfaceWorker", onJobComplete: (workerIndex, result) => this.scheduler.finishJob(workerIndex, result) });
            this.scheduler = new TileBakeScheduler(this.pool, { getProfileRevision: getSurfaceProfileRevision });
        }
    }
    _whenWorkersReady(run) {
        return Promise.resolve(this.workerReady).then(run);
    }
    _ensureStarted() {
        if (this._started) return;
        this.scheduler.updateFocus(this.pendingFocusX, this.pendingFocusY);
        this.pool.ensureStarted();
        this._started = true;
    }
    _sendRequest(type, payload, tier = TILE_BAKE_TIER.STATIC) {
        this._ensureStarted();
        return this._whenWorkersReady(() => this.scheduler.enqueue(type, payload, tier));
    }
    _broadcastRequest(type, payload) {
        this._ensureStarted();
        return this.scheduler.broadcast(type, payload);
    }
    _ensureRuntimeProfileOnWorkers(profileId) {
        if (!profileId) return this._whenWorkersReady(() => {});
        if (shippedSurfaceProfileIds().includes(profileId)) return this._whenWorkersReady(() => {});
        if (!surfaceProfileKnown(profileId)) return Promise.reject(new Error(`Unknown surface procedural profile: ${profileId}`));
        if (this.registeredRuntimeProfileIds.has(profileId)) return this.workerReady;
        return this.registerRuntimeProfile(profileId, resolveSurfaceProfile(profileId));
    }
    _requestProfileBake(type, payload, tier) {
        const profileId = payload.profileId;
        return this._ensureRuntimeProfileOnWorkers(profileId).then(() => {
            const profile = resolveSurfaceProfile(profileId);
            const normalized = withBakeFrameRange(payload, profile);
            return this._sendRequest(type, normalized, tier);
        });
    }
    updateFocus(x, y) {
        this.pendingFocusX = x;
        this.pendingFocusY = y;
        if (this._started) this.scheduler.updateFocus(x, y);
    }
    stats() {
        return this._started ? this.scheduler.stats() : { ...EMPTY_TILE_BAKE_STATS };
    }
    enableTileBakeMetrics(enabled = true) {
        setTileBakeMetricsEnabled(enabled);
        if (!this._started) return Promise.resolve();
        return this._broadcastRequest(TILE_WORKER_MESSAGE.CONFIGURE_BAKE_CONSTANTS, { metricsEnabled: enabled });
    }
    requestGroundChunkBake(payload) {
        return this._requestProfileBake(TILE_WORKER_MESSAGE.BAKE_GROUND_CHUNK, payload, TILE_BAKE_TIER.STATIC);
    }
    requestWallAtlasBake(payload) {
        return this._requestProfileBake(TILE_WORKER_MESSAGE.BAKE_WALL_ATLAS, payload, TILE_BAKE_TIER.STATIC);
    }
    requestHorizontalPatchBake(payload) {
        const profileId = payload.profileId;
        return this._ensureRuntimeProfileOnWorkers(profileId).then(() => {
            const profile = resolveSurfaceProfile(profileId);
            const normalized = withBakeFrameRange(payload, profile);
            const tier = (normalized.frameCount ?? 1) > 1 && !isFirstFrameRange(normalized) ? TILE_BAKE_TIER.ANIMATION : TILE_BAKE_TIER.STATIC;
            return this._sendRequest(TILE_WORKER_MESSAGE.BAKE_HORIZONTAL_PATCH, normalized, tier);
        });
    }
    registerRuntimeProfile(profileId, profile) {
        runtimeSurfaceProfiles[profileId] = profile;
        bumpSurfaceProfileRevision(profileId);
        this._ensureStarted();
        this.registeredRuntimeProfileIds.add(profileId);
        this.workerReady = this.workerReady.then(() => this._broadcastRequest(TILE_WORKER_MESSAGE.REGISTER_RUNTIME_PROFILE, { profileId, profile }));
        return this.workerReady;
    }
    syncBakeConstants(settings) {
        const constants = { cellSize: settings.cellSize, cellsPerChunk: settings.cellsPerChunk, surfaceBakeScale: settings.surfaceBakeScale, metricsEnabled: settings.metricsEnabled };
        this._ensureStarted();
        this.workerReady = this.workerReady.then(() => this._broadcastRequest(TILE_WORKER_MESSAGE.CONFIGURE_BAKE_CONSTANTS, constants));
        return this.workerReady;
    }
    shutdown() {
        if (!this._started) return;
        this.pool.shutdown();
        this._started = false;
    }
}
