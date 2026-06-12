import { wallGeometrySab, wallSharedEdgesSab } from "./SharedEdgeBuffers.js";
const workers = [];
const workerBusy = [];
const jobQueue = [];
const pending = new Map();
let nextReqId = 1;
/** @type {URL | string | null} */
let workerUrl = null;
/**
 * @param {{ workerUrl: URL | string }} config — inject Render/Deprecated/SharedEdgeWorkerEntry.js
 */
export function configureSharedEdgeWorkerCoordinator({ workerUrl: url }) {
    workerUrl = url;
}
function getWorkerPool() {
    if (workers.length === 0) {
        if (!workerUrl) throw new Error("SharedEdgeWorkerCoordinator requires configureSharedEdgeWorkerCoordinator({ workerUrl })");
        let poolSize = 2;
        if (typeof navigator !== "undefined" && navigator.hardwareConcurrency) poolSize = Math.min(4, Math.max(1, Math.floor(navigator.hardwareConcurrency * 0.25)));
        for (let i = 0; i < poolSize; i++) {
            const w = new Worker(workerUrl, { type: "module" });
            w.postMessage({ id: -1, type: "initSharedEdgesSAB", payload: { wallGeometrySab, wallSharedEdgesSab } });
            w.onmessage = (e) => {
                const { id, error } = e.data;
                const wi = workers.indexOf(w);
                workerBusy[wi] = false;
                const entry = pending.get(id);
                if (!entry) return;
                pending.delete(id);
                if (error) entry.reject(new Error(error));
                else entry.resolve();
                dispatch();
            };
            workers.push(w);
            workerBusy.push(false);
        }
    }
    return workers;
}
function dispatch() {
    for (let wi = 0; wi < workers.length; wi++) {
        if (workerBusy[wi] || jobQueue.length === 0) continue;
        const job = jobQueue.shift();
        workerBusy[wi] = true;
        workers[wi].postMessage({ id: job.id, type: job.type, payload: job.payload });
    }
}
export function requestSharedEdges(numWalls) {
    getWorkerPool();
    const id = nextReqId++;
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        jobQueue.push({ id, type: "rebuildSharedEdges", payload: { numWalls } });
        dispatch();
    });
}
