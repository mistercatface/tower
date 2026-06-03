import { listShippedFloorProfileIds, getFloorProceduralProfile } from "../../Config/floorProceduralConfig.js";

export const MAX_WALLS = 10000;
export const STRIDE = 5;
export const wallGeometrySab = new SharedArrayBuffer(MAX_WALLS * STRIDE * 4);
export const wallGeometryView = new Float32Array(wallGeometrySab);
export const wallSharedEdgesSab = new SharedArrayBuffer(MAX_WALLS);
export const wallSharedEdgesView = new Uint8Array(wallSharedEdgesSab);


const workers = [];
const workerBusy = [];
const jobQueue = [];
const pending = new Map();
const inFlightByKey = new Map();
let nextReqId = 1;
/** Bakes wait on this chain so runtime profiles reach workers before paint jobs run. */
let workerReady = Promise.resolve();
const registeredRuntimeProfileIds = new Set();

function whenWorkersReady(run) {
    return Promise.resolve(workerReady).then(run);
}

function chunkDedupeKey(payload) {
    return `chunk:${payload.profileId}:${payload.chunkCol},${payload.chunkRow}:${payload.seed ?? 0}${payload.firstFrameOnly ? ":first" : ""}`;
}

function wallDedupeKey(payload) {
    return `wall:${payload.profileId}:${payload.p1.x.toFixed(1)},${payload.p1.y.toFixed(1)}-${payload.p2.x.toFixed(1)},${payload.p2.y.toFixed(1)}${payload.firstFrameOnly ? ":first" : ""}`;
}

const activeAnimationBakes = new Set();
const animationBakeQueue = [];
const MAX_CONCURRENT_ANIMATION_BAKES = 1;

function processAnimationBakeQueue() {
    if (activeAnimationBakes.size >= MAX_CONCURRENT_ANIMATION_BAKES) {
        return;
    }
    if (animationBakeQueue.length === 0) {
        return;
    }

    const job = animationBakeQueue.shift();
    activeAnimationBakes.add(job);

    const promise = sendRequest(job.type, job.payload, job.priority);
    promise.then(
        (bitmaps) => {
            activeAnimationBakes.delete(job);
            job.resolve(bitmaps);
            processAnimationBakeQueue();
        },
        (error) => {
            activeAnimationBakes.delete(job);
            job.reject(error);
            processAnimationBakeQueue();
        }
    );
}

function requestAnimationBake(type, payload, priority = Infinity) {
    return new Promise((resolve, reject) => {
        const job = { type, payload, priority, resolve, reject };
        animationBakeQueue.push(job);
        processAnimationBakeQueue();
    });
}


function insertJob(job) {
    let lo = 0;
    let hi = jobQueue.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (jobQueue[mid].priority < job.priority) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    jobQueue.splice(lo, 0, job);
}

function dispatchJobs() {
    for (let wi = 0; wi < workers.length; wi++) {
        if (workerBusy[wi] || jobQueue.length === 0) {
            continue;
        }
        const job = jobQueue.shift();
        workerBusy[wi] = true;
        workers[wi]._currentJobId = job.id;
        workers[wi].postMessage({ id: job.id, type: job.type, payload: job.payload });
    }
}

function finishJob(workerIndex, id, bitmaps, error) {
    workerBusy[workerIndex] = false;
    workers[workerIndex]._currentJobId = null;

    if (!pending.has(id)) {
        dispatchJobs();
        return;
    }

    const { resolve, reject } = pending.get(id);
    pending.delete(id);

    if (error) {
        reject(new Error(error));
    } else {
        resolve(bitmaps);
    }
    dispatchJobs();
}

function enqueueJob(type, payload, priority = Infinity) {
    const id = nextReqId++;
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        insertJob({ id, type, payload, priority });
        dispatchJobs();
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

function sendRequest(type, payload, priority = Infinity) {
    getWorkerPool();
    return whenWorkersReady(() => enqueueJob(type, payload, priority));
}

function broadcastRequest(type, payload) {
    getWorkerPool();
    // Negative priority keeps registration ahead of viewport bakes (lower = sooner).
    return Promise.all(workers.map((_, i) => enqueueJob(type, payload, -1000 + i)));
}

export const TileWorkerCoordinator = {
    requestFloorChunkBake(payload, priority = Infinity) {
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
        if (inFlightByKey.has(dedupeKey)) {
            return inFlightByKey.get(dedupeKey);
        }

        let promise;
        if (isAnimated && !payload.firstFrameOnly) {
            promise = requestAnimationBake("bakeFloorChunk", payload, priority);
        } else {
            promise = sendRequest("bakeFloorChunk", payload, priority);
        }

        inFlightByKey.set(dedupeKey, promise);
        promise.finally(() => inFlightByKey.delete(dedupeKey));
        return promise;
    },

    requestWallFaceBake(payload, priority = Infinity) {
        const profileId = payload.profileId;
        const profile = getFloorProceduralProfile(profileId);
        const isAnimated = Boolean(profile?.animation);

        const dedupeKey = wallDedupeKey(payload);
        if (inFlightByKey.has(dedupeKey)) {
            return inFlightByKey.get(dedupeKey);
        }

        let promise;
        if (isAnimated && !payload.firstFrameOnly) {
            promise = requestAnimationBake("bakeWallFace", payload, priority);
        } else {
            promise = sendRequest("bakeWallFace", payload, priority);
        }

        inFlightByKey.set(dedupeKey, promise);
        promise.finally(() => inFlightByKey.delete(dedupeKey));
        return promise;
    },

    registerRuntimeProfile(profileId, profile) {
        getWorkerPool();
        registeredRuntimeProfileIds.add(profileId);
        workerReady = workerReady.then(() => broadcastRequest("registerRuntimeProfile", { profileId, profile }));
        return workerReady;
    },

    requestSharedEdges(numWalls, priority = Infinity) {
        return sendRequest("rebuildSharedEdges", { numWalls }, priority);
    },
};
