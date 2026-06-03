import { listShippedFloorProfileIds, getFloorProceduralProfile } from "../../Config/floorProceduralConfig.js";
import { frameRangeDedupeSuffix, isFirstFrameBakeRequest } from "./AnimationFrameBake.js";

export const MAX_WALLS = 10000;
export const STRIDE = 5;
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
const TIER_STATIC = 0;        // first-frame / non-animated bakes / shared edges
const TIER_ANIMATION = 1;     // incremental animation frame fill

/** Animation jobs farther than this from focus are dropped instead of baked. */
const ANIMATION_CULL_DIST_SQ = 4_000_000;
/** Re-sort the queue by focus only after the camera moves at least this far. */
const FOCUS_RESORT_DIST_SQ = 16 * 16;

const workers = [];
const workerBusy = [];
const bakeQueue = [];
const pending = new Map();
let nextReqId = 1;
/** Bakes wait on this chain so runtime profiles reach workers before paint jobs run. */
let workerReady = Promise.resolve();
const registeredRuntimeProfileIds = new Set();
const inFlightByKey = new Map();

let focusX = 0;
let focusY = 0;
let sortFocusX = 0;
let sortFocusY = 0;
let queueNeedsSort = false;

const runtimeProfileRevisions = new Map();

export function getProfileRevision(profileId) {
    return runtimeProfileRevisions.get(profileId) ?? 0;
}

function whenWorkersReady(run) {
    return Promise.resolve(workerReady).then(run);
}

function chunkDedupeKey(payload) {
    const rev = getProfileRevision(payload.profileId);
    return `chunk:${payload.profileId}:${rev}:${payload.chunkCol},${payload.chunkRow}:${payload.seed ?? 0}${frameRangeDedupeSuffix(payload)}`;
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
    if (!queueNeedsSort && bakeQueue.length > 1) {
        const movedSq = (focusX - sortFocusX) ** 2 + (focusY - sortFocusY) ** 2;
        if (movedSq < FOCUS_RESORT_DIST_SQ) return;
    }
    queueNeedsSort = false;
    sortFocusX = focusX;
    sortFocusY = focusY;
    for (const job of bakeQueue) {
        job.distSq = jobDistSq(job.payload);
    }
    bakeQueue.sort(compareJobs);
}

function insertJob(job) {
    // Keep the queue ordered so dispatch can just shift the front.
    let lo = 0;
    let hi = bakeQueue.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (compareJobs(bakeQueue[mid], job) < 0) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    bakeQueue.splice(lo, 0, job);
}

/** Resolve-and-skip a job that is no longer worth baking. Returns true if dropped. */
function dropIfObsolete(job) {
    const currentRev = getProfileRevision(job.payload?.profileId);
    if (job.revision !== undefined && job.revision < currentRev) {
        resolveJob(job, []);
        return true;
    }
    if (job.tier === TIER_ANIMATION && jobDistSq(job.payload) > ANIMATION_CULL_DIST_SQ) {
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
    if (bakeQueue.length === 0) return;
    resortQueueIfNeeded();

    for (let wi = 0; wi < workers.length; wi++) {
        if (workerBusy[wi]) continue;

        let job = null;
        while (bakeQueue.length > 0) {
            const candidate = bakeQueue.shift();
            if (!pending.has(candidate.id)) continue; // already settled elsewhere
            if (dropIfObsolete(candidate)) continue;
            job = candidate;
            break;
        }
        if (!job) break;

        workerBusy[wi] = true;
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
        if (error) {
            entry.reject(new Error(error));
        } else {
            entry.resolve(bitmaps);
        }
    }
    dispatch();
}

function enqueueJob(type, payload, tier) {
    const id = nextReqId++;
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        const job = {
            id,
            type,
            payload,
            tier,
            revision: getProfileRevision(payload?.profileId),
            distSq: jobDistSq(payload),
        };
        insertJob(job);
        dispatch();
    });
}

function getWorkerPool() {
    if (workers.length === 0) {
        let poolSize = 4;
        if (typeof navigator !== "undefined" && navigator.hardwareConcurrency) {
            poolSize = Math.min(8, Math.max(2, Math.floor(navigator.hardwareConcurrency * 0.75)));
        }

        for (let i = 0; i < poolSize; i++) {
            const w = new Worker(new URL("./TileWorker.js", import.meta.url), { type: "module" });
            w.postMessage({
                id: -1,
                type: "initSharedEdgesSAB",
                payload: { wallGeometrySab, wallSharedEdgesSab }
            });
            w.onmessage = (e) => {
                const { id, bitmaps, error } = e.data;
                const wi = workers.indexOf(w);
                finishJob(wi, id, bitmaps, error);
            };
            workers.push(w);
            workerBusy.push(false);
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

function requestBake(type, payload, isAnimated) {
    const tier = isAnimated && !isFirstFrameBakeRequest(payload) ? TIER_ANIMATION : TIER_STATIC;
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

    requestFloorChunkBake(payload) {
        const profileId = payload.profileId;
        if (profileId && !listShippedFloorProfileIds().includes(profileId) && !registeredRuntimeProfileIds.has(profileId)) {
            try {
                const profile = getFloorProceduralProfile(profileId);
                this.registerRuntimeProfile(profileId, profile);
            } catch (err) {
                console.warn(`TileWorkerCoordinator: custom profile not found/registered for ${profileId}`, err);
            }
        }

        const profile = getFloorProceduralProfile(profileId);
        const isAnimated = Boolean(profile?.animation);

        const dedupeKey = chunkDedupeKey(payload);
        const existing = inFlightByKey.get(dedupeKey);
        if (existing) return existing;

        const promise = requestBake("bakeFloorChunk", payload, isAnimated);
        inFlightByKey.set(dedupeKey, promise);
        promise.finally(() => inFlightByKey.delete(dedupeKey));
        return promise;
    },

    requestWallFaceBake(payload) {
        const profileId = payload.profileId;
        const profile = getFloorProceduralProfile(profileId);
        const isAnimated = Boolean(profile?.animation);

        const dedupeKey = wallDedupeKey(payload);
        const existing = inFlightByKey.get(dedupeKey);
        if (existing) return existing;

        const promise = requestBake("bakeWallFace", payload, isAnimated);
        inFlightByKey.set(dedupeKey, promise);
        promise.finally(() => inFlightByKey.delete(dedupeKey));
        return promise;
    },

    registerRuntimeProfile(profileId, profile) {
        const rev = (runtimeProfileRevisions.get(profileId) ?? 0) + 1;
        runtimeProfileRevisions.set(profileId, rev);
        getWorkerPool();
        registeredRuntimeProfileIds.add(profileId);
        workerReady = workerReady.then(() => broadcastRequest("registerRuntimeProfile", { profileId, profile }));
        return workerReady;
    },

    requestSharedEdges(numWalls) {
        return sendRequest("rebuildSharedEdges", { numWalls }, TIER_STATIC);
    },
};
