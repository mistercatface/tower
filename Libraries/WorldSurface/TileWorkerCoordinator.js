import { getSurfaceProfileProvider } from "../Procedural/SurfaceProfileProvider.js";
import { PromiseWorkerPoolHost } from "../Workers/PromiseWorkerPoolHost.js";
import { bumpSurfaceProfileRevision, getSurfaceProfileRevision } from "./SurfaceProfileRevision.js";
import { clampBakeFrameRange, isFirstFrameRange } from "./AnimationFrameBake.js";
import { getAnimationFrames } from "./ProfileBakeResolver.js";
import { MinHeap } from "../DataStructures/MinHeap.js";
import { getSurfaceBakeScale } from "./WorldSurfaceResolution.js";
/**
 * Job tiers. The scheduler always drains lower tiers first, then sorts by
 * distance-to-focus within a tier. This is what guarantees the whole visible
 * area draws (static/first frames) before any animation frames are baked,
 * without needing a separate queue or an artificial concurrency throttle.
 */
const TIER_REGISTRATION = -1; // runtime profile sync — must reach workers before any paint
const TIER_STATIC = 0; // first-frame / non-animated bakes
const TIER_ANIMATION = 1; // incremental animation frame fill
/** Re-sort the queue by focus only after the camera moves at least this far. */
const FOCUS_RESORT_DIST_SQ = 16 * 16;
const bakeQueue = new MinHeap(compareJobs);
const pending = new Map();
let nextReqId = 1;
/** Bakes wait on this chain so runtime profiles reach workers before paint jobs run. */
let workerReady = Promise.resolve();
const registeredRuntimeProfileIds = new Set();
const inFlightByKey = new Map();
/** @type {PromiseWorkerPoolHost | null} */
let workerPool = null;
/** @type {URL | string | null} */
let tileWorkerUrl = null;
/**
 * @param {{ workerUrl: URL | string }} config — game injects Render/WorldSurface/TileWorkerEntry.js
 */
export function configureTileWorkerCoordinator({ workerUrl }) {
    tileWorkerUrl = workerUrl;
}
let focusX = 0;
let focusY = 0;
let sortFocusX = 0;
let sortFocusY = 0;
let queueNeedsSort = false;
export function getProfileRevision(profileId) {
    return getSurfaceProfileRevision(profileId);
}
function whenWorkersReady(run) {
    return Promise.resolve(workerReady).then(run);
}
function chunkDedupeKey(payload) {
    const rev = getProfileRevision(payload.profileId);
    const zTag = (payload.zLevel ?? 0) > 0 ? `z${payload.zLevel}roof` : `z${payload.zLevel ?? 0}`;
    return `chunk:${payload.profileId}:${rev}:${zTag}:${payload.chunkCol},${payload.chunkRow}:${payload.seed ?? 0}`;
}
function patchDedupeKey(payload) {
    const rev = getProfileRevision(payload.profileId);
    const zTag = (payload.zLevel ?? 0) > 0 ? `z${payload.zLevel}roof` : `z${payload.zLevel ?? 0}`;
    return `patch:${payload.profileId}:${rev}:${zTag}:${payload.originX.toFixed(1)},${payload.originY.toFixed(1)}:${payload.worldWidth.toFixed(1)}x${payload.worldHeight.toFixed(1)}:${payload.seed ?? 0}`;
}
function jobDistSq(payload) {
    const cx = payload?.centerX ?? focusX;
    const cy = payload?.centerY ?? focusY;
    return (cx - focusX) ** 2 + (cy - focusY) ** 2;
}
function compareJobs(a, b) {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return a.distSq - b.distSq;
}
function resortQueueIfNeeded() {
    if (!queueNeedsSort && bakeQueue.size > 1) {
        const movedSq = (focusX - sortFocusX) ** 2 + (focusY - sortFocusY) ** 2;
        if (movedSq < FOCUS_RESORT_DIST_SQ) return;
    }
    queueNeedsSort = false;
    sortFocusX = focusX;
    sortFocusY = focusY;
    const data = bakeQueue.data;
    for (const job of data) job.distSq = jobDistSq(job.payload);
    for (let i = (data.length >> 1) - 1; i >= 0; i--) bakeQueue.down(i);
}
function insertJob(job) {
    bakeQueue.push(job);
}
/** Resolve-and-skip a job that is no longer worth baking. Returns true if dropped. */
function dropIfObsolete(job) {
    const currentRev = getProfileRevision(job.payload?.profileId);
    if (job.revision !== undefined && job.revision < currentRev) {
        resolveJob(job, []);
        return true;
    }
    return false;
}
function resolveJob(job, bitmaps) {
    const entry = pending.get(job.id);
    if (!entry) return;
    pending.delete(job.id);
    entry.resolve(bitmaps);
}
function dispatch() {
    if (bakeQueue.size === 0) return;
    const pool = ensureWorkerPool();
    resortQueueIfNeeded();
    let activeAnimations = 0;
    pool.forEachSlot((wi, slot) => {
        if (slot.busy && slot.meta?.tier === TIER_ANIMATION) activeAnimations++;
    });
    // Leave some worker threads idle from animations so the main thread and
    // static generation have breathing room.
    const maxAnimations = Math.max(1, pool.size - 2);
    pool.forEachIdle((wi) => {
        let job = null;
        while (bakeQueue.size > 0) {
            const candidate = bakeQueue.data[0];
            if (candidate.tier === TIER_ANIMATION && activeAnimations >= maxAnimations) break;
            const popped = bakeQueue.pop();
            if (!pending.has(popped.id)) continue;
            if (dropIfObsolete(popped)) continue;
            job = popped;
            if (job.tier === TIER_ANIMATION) activeAnimations++;
            break;
        }
        if (!job) return;
        pool.markBusy(wi, { jobId: job.id, tier: job.tier });
        pool.postJob(wi, { id: job.id, type: job.type, payload: job.payload });
    });
}
function finishJob(workerIndex, id, bitmaps, error) {
    const entry = pending.get(id);
    if (entry) {
        pending.delete(id);
        if (error) entry.reject(new Error(error));
        else entry.resolve(bitmaps);
    }
    dispatch();
}
function enqueueJob(type, payload, tier) {
    const id = nextReqId++;
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        const job = { id, type, payload, tier, revision: getProfileRevision(payload?.profileId), distSq: jobDistSq(payload) };
        insertJob(job);
        dispatch();
    });
}
function ensureWorkerPool() {
    if (workerPool) return workerPool;
    if (!tileWorkerUrl) throw new Error("TileWorkerCoordinator requires configureTileWorkerCoordinator({ workerUrl }) from game bootstrap");
    workerPool = new PromiseWorkerPoolHost(tileWorkerUrl, { name: "TileSurfaceWorker", onJobComplete: (workerIndex, { id, bitmaps, error }) => finishJob(workerIndex, id, bitmaps, error) });
    workerPool.ensureStarted();
    return workerPool;
}
function sendRequest(type, payload, tier = TIER_STATIC) {
    ensureWorkerPool();
    return whenWorkersReady(() => enqueueJob(type, payload, tier));
}
function broadcastRequest(type, payload) {
    const pool = ensureWorkerPool();
    return Promise.all(Array.from({ length: pool.size }, () => enqueueJob(type, payload, TIER_REGISTRATION)));
}
function withBakeFrameRange(payload, profile) {
    const sourceTotal = getAnimationFrames(profile?.animation);
    const bakeTotal = payload.animationBakeFrames ?? sourceTotal;
    const range = clampBakeFrameRange({ frameStart: payload.frameStart, frameCount: payload.frameCount }, bakeTotal);
    return { ...payload, ...range, animationSourceFrames: payload.animationSourceFrames ?? sourceTotal };
}
function requestBake(type, payload, isAnimated) {
    const tier = isAnimated && !isFirstFrameRange(payload) ? TIER_ANIMATION : TIER_STATIC;
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
        focusX = x;
        focusY = y;
    },
    getProfileRevision(profileId) {
        return getProfileRevision(profileId);
    },
    requestGroundChunkBake(payload) {
        const profileId = payload.profileId;
        return ensureRuntimeProfileOnWorkers(profileId).then(() => {
            const profile = getSurfaceProfileProvider().getProfile(profileId);
            const normalized = withBakeFrameRange(payload, profile);
            return sendRequest("bakeGroundChunk", normalized, TIER_STATIC);
        });
    },
    requestWallAtlasBake(payload) {
        const profileId = payload.profileId;
        return ensureRuntimeProfileOnWorkers(profileId).then(() => {
            const profile = getSurfaceProfileProvider().getProfile(profileId);
            const normalized = withBakeFrameRange(payload, profile);
            return sendRequest("bakeWallAtlas", normalized, TIER_STATIC);
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
        ensureWorkerPool();
        registeredRuntimeProfileIds.add(profileId);
        workerReady = workerReady.then(() => broadcastRequest("registerRuntimeProfile", { profileId, profile }));
        return workerReady;
    },
    syncBakeConstants(settings) {
        const constants = { cellSize: settings.cellSize, cellsPerChunk: settings.cellsPerChunk, surfaceBakeScale: getSurfaceBakeScale(settings) };
        ensureWorkerPool();
        workerReady = workerReady.then(() => broadcastRequest("configureBakeConstants", constants));
        return workerReady;
    },
};
