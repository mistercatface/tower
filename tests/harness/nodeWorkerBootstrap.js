import { parentPort, workerData } from "node:worker_threads";

/** @type {WorkerGlobalScope & { postMessage: (data: unknown, transfer?: Transferable[]) => void }} */
globalThis.self = {
    postMessage(data, transfer) {
        if (Array.isArray(transfer) && transfer.length) parentPort.postMessage(data, transfer);
        else parentPort.postMessage(data);
    },
};

parentPort.on("message", (data) => {
    if (typeof globalThis.self.onmessage === "function") globalThis.self.onmessage({ data });
});

await import(workerData.target);
