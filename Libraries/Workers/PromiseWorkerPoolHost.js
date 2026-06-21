function defaultPoolSize() {
    if (typeof navigator !== "undefined" && navigator.hardwareConcurrency) return Math.min(8, Math.max(2, Math.floor(navigator.hardwareConcurrency * 0.75)));
    return 4;
}
/**
 * Multi-worker pool with id-based job completion callbacks.
 * Used for transferable-result workers (ImageBitmap bakes); nav workers use SabSlotWorkerHost instead.
 */
export class PromiseWorkerPoolHost {
    constructor(workerUrl, options = {}) {
        this.workerUrl = workerUrl;
        this.name = options.name ?? "WorkerPool";
        this.poolSize = options.poolSize ?? defaultPoolSize();
        this.createWorker = options.createWorker ?? ((url) => new Worker(url, { type: "module" }));
        this.onJobComplete = options.onJobComplete ?? (() => {});
        this.onWorkerError =
            options.onWorkerError ??
            ((err) => {
                console.error(`${this.name} error:`, err.message ?? err);
            });
        this._slots = [];
        this._started = false;
    }
    get size() {
        this.ensureStarted();
        return this._slots.length;
    }
    ensureStarted() {
        if (this._started) return;
        if (!this.workerUrl) throw new Error(`${this.name} requires a workerUrl`);
        for (let index = 0; index < this.poolSize; index++) this._slots.push(this._createSlot(index));
        this._started = true;
    }
    _createSlot(index) {
        const worker = this.createWorker(this.workerUrl, index);
        const slot = { index, worker, busy: false, meta: null };
        worker.onmessage = (e) => {
            const { id, bitmaps, error } = e.data ?? {};
            slot.busy = false;
            slot.meta = null;
            this.onJobComplete(index, { id, bitmaps, error });
        };
        worker.onerror = (err) => this.onWorkerError(err);
        return slot;
    }
    isBusy(index) {
        return this._slots[index].busy;
    }
    getMeta(index) {
        return this._slots[index].meta;
    }
    markBusy(index, meta) {
        const slot = this._slots[index];
        slot.busy = true;
        slot.meta = meta;
    }
    postJob(index, message) {
        this._slots[index].worker.postMessage(message);
    }
    forEachIdle(fn) {
        for (const slot of this._slots) if (!slot.busy) fn(slot.index, slot);
    }
    forEachSlot(fn) {
        for (const slot of this._slots) fn(slot.index, slot);
    }
    recycleWorker(index) {
        const old = this._slots[index];
        try {
            old.worker.terminate();
        } catch (e) {}
        this._slots[index] = this._createSlot(index);
    }
    shutdown() {
        for (const slot of this._slots) {
            slot.worker.onmessage = null;
            slot.worker.onerror = null;
            try {
                slot.worker.terminate();
            } catch (e) {}
        }
        this._slots.length = 0;
        this._started = false;
    }
}
