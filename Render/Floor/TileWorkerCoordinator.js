import { getFloorProceduralProfile } from "../../Config/floorProceduralConfig.js";

const workers = [];
const workerBusy = [];
const jobQueue = [];
const pending = new Map();
const inFlightByKey = new Map();
let nextReqId = 1;
/** Bakes wait on this chain so runtime profiles reach workers before paint jobs run. */
let workerReady = Promise.resolve();

function whenWorkersReady(run) {
    return Promise.resolve(workerReady).then(run);
}

function chunkDedupeKey(payload) {
    let key = `chunk:${payload.profileId}:${payload.chunkCol},${payload.chunkRow}:${payload.seed ?? 0}`;
    if (payload.tetherOrigin) {
        key += `:t${payload.tetherOrigin.x},${payload.tetherOrigin.y}`;
    }
    return key;
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

function hasPlayerAnchorPayload(payload) {
    if (payload.tetherOrigin && payload.playerAnchorBinding) {
        return true;
    }
    return Boolean(payload.player && (payload.playerAnchorBinding || payload.playerAnchorPath));
}

export const TileWorkerCoordinator = {
    requestFloorChunkBake(payload, priority = Infinity) {
        const dedupeKey = chunkDedupeKey(payload);
        if (inFlightByKey.has(dedupeKey)) {
            return inFlightByKey.get(dedupeKey);
        }

        const profile = getFloorProceduralProfile(payload.profileId);
        const hasAnimation = Boolean(profile.animation);
        const hasPlayerAnchor = hasPlayerAnchorPayload(payload);

        const promise = hasAnimation
            ? sendRequest("bakeFloorChunkAnimated", payload, priority)
            : hasPlayerAnchor
                ? sendRequest("bakeFloorChunkFrame", { ...payload, frameIndex: 0 }, priority)
                : sendRequest("bakeFloorChunk", payload, priority);

        inFlightByKey.set(dedupeKey, promise);
        promise.finally(() => inFlightByKey.delete(dedupeKey));
        return promise;
    },

    requestWallFaceBake(payload, priority = Infinity) {
        return sendRequest("bakeWallFace", payload, priority);
    },

    registerRuntimeProfile(profileId, profile) {
        getWorkerPool();
        workerReady = workerReady.then(() =>
            broadcastRequest("registerRuntimeProfile", { profileId, profile }),
        );
        return workerReady;
    },
};
