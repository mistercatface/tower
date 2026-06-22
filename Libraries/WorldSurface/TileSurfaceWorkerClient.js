import { getSurfaceProfileProvider } from "../Procedural/SurfaceProfileProvider.js";
import { PromiseWorkerPoolHost } from "../Workers/PromiseWorkerPoolHost.js";
import { bumpSurfaceProfileRevision, getSurfaceProfileRevision } from "./SurfaceProfileRevision.js";
import { clampBakeFrameRange, isFirstFrameRange } from "./AnimationFrameBake.js";
import { getAnimationFrames } from "./ProfileBakeResolver.js";
import { TILE_BAKE_TIER, TileBakeScheduler } from "./TileBakeScheduler.js";
import { TILE_WORKER_MESSAGE } from "./TileWorkerMessages.js";
import { getSurfaceBakeScale } from "./WorldSurfaceResolution.js";
const EMPTY_STATS = { queueSize: 0, pendingCount: 0, inFlightDedupeCount: 0, busyWorkers: 0 };
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
    _requestBake(type, payload, isAnimated) {
        const tier = isAnimated && !isFirstFrameRange(payload) ? TILE_BAKE_TIER.ANIMATION : TILE_BAKE_TIER.STATIC;
        return this._sendRequest(type, payload, tier);
    }
    _ensureRuntimeProfileOnWorkers(profileId) {
        if (!profileId) return this._whenWorkersReady(() => {});
        const provider = getSurfaceProfileProvider();
        if (provider.listShippedIds().includes(profileId)) return this._whenWorkersReady(() => {});
        if (!provider.hasProfile(profileId)) return Promise.reject(new Error(`Unknown surface procedural profile: ${profileId}`));
        if (this.registeredRuntimeProfileIds.has(profileId)) return this.workerReady;
        return this.registerRuntimeProfile(profileId, provider.getProfile(profileId));
    }
    updateFocus(x, y) {
        this.pendingFocusX = x;
        this.pendingFocusY = y;
        if (this._started) this.scheduler.updateFocus(x, y);
    }
    stats() {
        return this._started ? this.scheduler.stats() : { ...EMPTY_STATS };
    }
    getProfileRevision(profileId) {
        return getSurfaceProfileRevision(profileId);
    }
    requestGroundChunkBake(payload) {
        const profileId = payload.profileId;
        return this._ensureRuntimeProfileOnWorkers(profileId).then(() => {
            const profile = getSurfaceProfileProvider().getProfile(profileId);
            const normalized = withBakeFrameRange(payload, profile);
            return this._sendRequest(TILE_WORKER_MESSAGE.BAKE_GROUND_CHUNK, normalized, TILE_BAKE_TIER.STATIC);
        });
    }
    requestWallAtlasBake(payload) {
        const profileId = payload.profileId;
        return this._ensureRuntimeProfileOnWorkers(profileId).then(() => {
            const profile = getSurfaceProfileProvider().getProfile(profileId);
            const normalized = withBakeFrameRange(payload, profile);
            return this._sendRequest(TILE_WORKER_MESSAGE.BAKE_WALL_ATLAS, normalized, TILE_BAKE_TIER.STATIC);
        });
    }
    requestHorizontalPatchBake(payload) {
        const profileId = payload.profileId;
        return this._ensureRuntimeProfileOnWorkers(profileId).then(() => {
            const profile = getSurfaceProfileProvider().getProfile(profileId);
            const normalized = withBakeFrameRange(payload, profile);
            return this._requestBake(TILE_WORKER_MESSAGE.BAKE_HORIZONTAL_PATCH, normalized, (normalized.frameCount ?? 1) > 1);
        });
    }
    registerRuntimeProfile(profileId, profile) {
        getSurfaceProfileProvider().registerRuntime(profileId, profile);
        bumpSurfaceProfileRevision(profileId);
        this._ensureStarted();
        this.registeredRuntimeProfileIds.add(profileId);
        this.workerReady = this.workerReady.then(() => this._broadcastRequest(TILE_WORKER_MESSAGE.REGISTER_RUNTIME_PROFILE, { profileId, profile }));
        return this.workerReady;
    }
    syncBakeConstants(settings) {
        const constants = { cellSize: settings.cellSize, cellsPerChunk: settings.cellsPerChunk, surfaceBakeScale: getSurfaceBakeScale(settings) };
        this._ensureStarted();
        this.workerReady = this.workerReady.then(() => this._broadcastRequest(TILE_WORKER_MESSAGE.CONFIGURE_BAKE_CONSTANTS, constants));
        return this.workerReady;
    }
    recycleWorkers() {
        if (!this._started) return;
        for (let i = 0; i < this.pool.size; i++) this.pool.recycleWorker(i);
    }
    shutdown() {
        if (!this._started) return;
        this.pool.shutdown();
        this._started = false;
    }
}
