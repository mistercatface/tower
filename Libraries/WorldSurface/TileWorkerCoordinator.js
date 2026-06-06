import { getSurfaceProfileProvider } from "../Procedural/SurfaceProfileProvider.js";
import { bumpSurfaceProfileRevision, getSurfaceProfileRevision } from "./SurfaceProfileRevision.js";
import { clampBakeFrameRange, frameRangeDedupeSuffix, isFirstFrameRange } from "./AnimationFrameBake.js";
import { getAnimationFrames } from "./ProfileBakeResolver.js";
import { MinHeap } from "../DataStructures/MinHeap.js";
export const MAX_WALLS = 10000;
export const STRIDE = 6;
export const wallGeometrySab = new SharedArrayBuffer(MAX_WALLS * STRIDE * 4);
export const wallGeometryView = new Float32Array(wallGeometrySab);
export const wallSharedEdgesSab = new SharedArrayBuffer(MAX_WALLS);
export const wallSharedEdgesView = new Uint8Array(wallSharedEdgesSab);
/**
 * Job tiers. The scheduler always drains lower tiers first, then sorts by
 * distance-to-focus within a tier. This is what guarantees the whole visible
 * area draws (static/first frames) before any animation frames are baked,
 * without needing a separate queue or an artificial concurrency throttle.
 */
const TIER_REGISTRATION = -1; // runtime profile sync — must reach workers before any paint
const TIER_STATIC = 0; // first-frame / non-animated bakes / shared edges
const TIER_ANIMATION = 1; // incremental animation frame fill
/** Re-sort the queue by focus only after the camera moves at least this far. */
const FOCUS_RESORT_DIST_SQ = 16 * 16;
const workers = [];
const workerBusy = [];
const workerJobTier = [];
const bakeQueue = new MinHeap(compareJobs);
const pending = new Map();
let nextReqId = 1;
/** Bakes wait on this chain so runtime profiles reach workers before paint jobs run. */
let workerReady = Promise.resolve();
const registeredRuntimeProfileIds = new Set();
const inFlightByKey = new Map();
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
    return `chunk:${payload.profileId}:${rev}:${zTag}:${payload.chunkCol},${payload.chunkRow}:${payload.seed ?? 0}${frameRangeDedupeSuffix(payload)}`;
}
function wallDedupeKey(payload) {
    const rev = getProfileRevision(payload.profileId);
    return `wall:${payload.profileId}:${rev}:${payload.p1.x.toFixed(1)},${payload.p1.y.toFixed(1)}-${payload.p2.x.toFixed(1)},${payload.p2.y.toFixed(1)}:${payload.seed ?? 0}${frameRangeDedupeSuffix(payload)}`;
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
    resortQueueIfNeeded();
    let activeAnimations = 0;
    for (let wi = 0; wi < workers.length; wi++) if (workerBusy[wi] && workerJobTier[wi] === TIER_ANIMATION) activeAnimations++;
    // Leave some worker threads idle from animations so the main thread and
    // static generation have breathing room.
    const maxAnimations = Math.max(1, workers.length - 2);
    for (let wi = 0; wi < workers.length; wi++) {
        if (workerBusy[wi]) continue;
        let job = null;
        while (bakeQueue.size > 0) {
            const candidate = bakeQueue.data[0];
            if (candidate.tier === TIER_ANIMATION && activeAnimations >= maxAnimations) break; // Top is animation and we're at limit; rest of heap is also animation
            const popped = bakeQueue.pop();
            if (!pending.has(popped.id)) continue; // already settled elsewhere
            if (dropIfObsolete(popped)) continue;
            job = popped;
            if (job.tier === TIER_ANIMATION) activeAnimations++;
            break;
        }
        if (!job) break;
        workerBusy[wi] = true;
        workerJobTier[wi] = job.tier;
        workers[wi]._currentJobId = job.id;
        workers[wi].postMessage({ id: job.id, type: job.type, payload: job.payload });
    }
}
function finishJob(workerIndex, id, bitmaps, error) {
    workerBusy[workerIndex] = false;
    workers[workerIndex]._currentJobId = null;
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
function getWorkerPool() {
    if (workers.length === 0) {
        let poolSize = 4;
        if (typeof navigator !== "undefined" && navigator.hardwareConcurrency) poolSize = Math.min(8, Math.max(2, Math.floor(navigator.hardwareConcurrency * 0.75)));
        if (!tileWorkerUrl) throw new Error("TileWorkerCoordinator requires configureTileWorkerCoordinator({ workerUrl }) from game bootstrap");
        for (let i = 0; i < poolSize; i++) {
            const w = new Worker(tileWorkerUrl, { type: "module" });
            w.postMessage({ id: -1, type: "initSharedEdgesSAB", payload: { wallGeometrySab, wallSharedEdgesSab } });
            w.onmessage = (e) => {
                const { id, bitmaps, error } = e.data;
                const wi = workers.indexOf(w);
                finishJob(wi, id, bitmaps, error);
            };
            workers.push(w);
            workerBusy.push(false);
            workerJobTier.push(null);
        }
    }
    return workers;
}
function sendRequest(type, payload, tier = TIER_STATIC) {
    getWorkerPool();
    return whenWorkersReady(() => enqueueJob(type, payload, tier));
}
function broadcastRequest(type, payload) {
    getWorkerPool();
    return Promise.all(workers.map(() => enqueueJob(type, payload, TIER_REGISTRATION)));
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
        const provider = getSurfaceProfileProvider();
        if (profileId && !provider.listShippedIds().includes(profileId) && !registeredRuntimeProfileIds.has(profileId))
            try {
                const profile = provider.getProfile(profileId);
                this.registerRuntimeProfile(profileId, profile);
            } catch (err) {
                console.warn(`TileWorkerCoordinator: custom profile not found/registered for ${profileId}`, err);
            }
        const profile = provider.getProfile(profileId);
        const isAnimated = Boolean(profile?.animation);
        const normalized = withBakeFrameRange(payload, profile);
        return requestBake("bakeGroundChunk", normalized, isAnimated);
    },
    requestWallAtlasBake(payload) {
        const profileId = payload.profileId;
        const profile = getSurfaceProfileProvider().getProfile(profileId);
        const isAnimated = Boolean(profile?.animation);
        const normalized = withBakeFrameRange(payload, profile);
        return requestBake("bakeWallAtlas", normalized, isAnimated);
    },
    registerRuntimeProfile(profileId, profile) {
        getSurfaceProfileProvider().registerRuntime(profileId, profile);
        bumpSurfaceProfileRevision(profileId);
        getWorkerPool();
        registeredRuntimeProfileIds.add(profileId);
        workerReady = workerReady.then(() => broadcastRequest("registerRuntimeProfile", { profileId, profile }));
        return workerReady;
    },
    requestSharedEdges(numWalls) {
        return sendRequest("rebuildSharedEdges", { numWalls }, TIER_STATIC);
    },
};
