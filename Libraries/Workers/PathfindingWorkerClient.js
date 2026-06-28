import { createSabSlotWorkerHost } from "./SabSlotWorkerHost.js";
/**
 * Shared worker client abstraction for pathfinding & flow field workers.
 * Manages worker lifetime, message routing, and slot-based shared buffer handshakes.
 */
export class PathfindingWorkerClient {
    constructor(workerUrl, slotCount, name, onMessage, onError) {
        this.workerUrl = workerUrl;
        this.slotCount = slotCount;
        this.name = name;
        this.onMessage = onMessage;
        this.onError = onError || ((err) => console.error(`${name} error:`, err.message, err.error?.stack || err.stack || err));
        this.host = createSabSlotWorkerHost(workerUrl, slotCount);
        this.bindWorkerHandlers();
    }
    get worker() {
        return this.host.worker;
    }
    bindWorkerHandlers() {
        this.host.worker.onmessage = (e) => this.onMessage(e.data);
        this.host.worker.onerror = (err) => this.onError(err);
    }
    postMessage(message) {
        this.host.worker.postMessage(message);
    }
    postSlot(slot, payload) {
        return this.host.post(slot, payload);
    }
    markReady(slot, requestId) {
        this.host.markReady(slot, requestId);
    }
    isReady(slot) {
        return this.host.isReady(slot);
    }
    waitForSlot(slot, requestId) {
        return this.host.waitForSlot(slot, requestId);
    }
    invalidateSlots() {
        this.host.invalidateSlots();
    }
    recycleWorker() {
        try {
            this.host.worker.terminate();
        } catch (e) {}
        this.host.worker = new Worker(this.workerUrl, { type: "module" });
        this.bindWorkerHandlers();
    }
    shutdown() {
        this.invalidateSlots();
        this.host.worker.onmessage = null;
        this.host.worker.onerror = null;
        try {
            this.host.worker.terminate();
        } catch (e) {}
    }
}
