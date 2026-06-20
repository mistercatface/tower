import { Worker as NodeWorker } from "node:worker_threads";

const bootstrapUrl = new URL("./nodeWorkerBootstrap.js", import.meta.url);

let installed = false;
/** @type {Set<Worker>} */
const trackedWorkers = new Set();

/** Browser-style Worker on Node via worker_threads + self polyfill in nodeWorkerBootstrap.js */
export function installNodeWorkerShim() {
    if (installed || globalThis.Worker) return;
    installed = true;

    globalThis.Worker = class Worker {
        /** @type {import("node:worker_threads").Worker} */
        #nodeWorker;
        /** @type {((event: MessageEvent) => void) | null} */
        onmessage = null;
        /** @type {((event: ErrorEvent) => void) | null} */
        onerror = null;

        /** @param {URL | string} scriptURL @param {{ type?: string }} [_options] */
        constructor(scriptURL, _options = {}) {
            const target = scriptURL instanceof URL ? scriptURL.href : new URL(scriptURL, import.meta.url).href;
            this.#nodeWorker = new NodeWorker(bootstrapUrl, { workerData: { target }, type: "module" });
            trackedWorkers.add(this);
            this.#nodeWorker.on("message", (data) => {
                this.onmessage?.({ data });
            });
            this.#nodeWorker.on("error", (err) => {
                this.onerror?.(err);
            });
            this.#nodeWorker.on("messageerror", (err) => {
                this.onerror?.(err);
            });
        }

        /** @param {unknown} data @param {Transferable[]} [transfer] */
        postMessage(data, transfer) {
            if (Array.isArray(transfer) && transfer.length) this.#nodeWorker.postMessage(data, transfer);
            else this.#nodeWorker.postMessage(data);
        }

        terminate() {
            trackedWorkers.delete(this);
            this.onmessage = null;
            this.onerror = null;
            this.#nodeWorker.removeAllListeners();
            return this.#nodeWorker.terminate();
        }
    };
}

/** @param {InstanceType<typeof globalThis.Worker>[]} [skip] */
export async function terminateAllTrackedWorkers(skip = []) {
    const skipSet = new Set(skip);
    const pending = [...trackedWorkers].filter((worker) => !skipSet.has(worker)).map((worker) => worker.terminate());
    trackedWorkers.clear();
    await Promise.allSettled(pending);
}
