import { HPA_REPLAN_FRAME_START_BUDGET, HPA_REPLAN_PEAK_INFLIGHT_CAP } from "./hpaReplanPolicy.js";
import { MAX_HPA_REPLAN_SLOTS } from "./HpaPathWorker.js";
export class HpaPathSession {
    constructor(hpaPathWorker, { frameStartBudget = HPA_REPLAN_FRAME_START_BUDGET, peakInflightCap = HPA_REPLAN_PEAK_INFLIGHT_CAP } = {}) {
        this.worker = hpaPathWorker;
        this._frameStartBudget = frameStartBudget;
        this._peakInflightCap = Math.min(peakInflightCap, MAX_HPA_REPLAN_SLOTS);
        this._nextRequestId = 1;
        this._pendingRequests = new WeakMap();
        this._replanPriority = new WeakMap();
        this._lastReplanFrame = new WeakMap();
        this._draining = new WeakSet();
        this._queuedNavStates = new WeakSet();
        this._waitQueue = [];
        this._activeWorkerCount = 0;
        this._slotWaiters = [];
        this._frameId = 0;
        this._frameStartsUsed = 0;
        this._peakInflightSeen = 0;
    }
    isReplanInFlight(navState) {
        return navState.hpaReplanRequestId !== 0;
    }
    getInflightCount() {
        return this._activeWorkerCount;
    }
    getPeakInflightReplans() {
        return this._peakInflightSeen;
    }
    resetPeakInflightReplans() {
        this._peakInflightSeen = 0;
    }
    beginFrame(frameId) {
        if (frameId != null && frameId === this._frameId) return;
        this._frameId = frameId ?? this._frameId + 1;
        this._frameStartsUsed = 0;
    }
    flushFrame() {
        this._pumpQueue();
    }
    requestReplan(navState, request, priority = 0) {
        const lastFrame = this._lastReplanFrame.get(navState) ?? -9999;
        if (this._frameId - lastFrame < 15) return false;
        this._lastReplanFrame.set(navState, this._frameId);
        this._pendingRequests.set(navState, request);
        this._replanPriority.set(navState, priority);
        navState.hpaReplanRequestId = this._nextRequestId++;
        if (this._draining.has(navState)) return true;
        this._enqueue(navState);
        return true;
    }
    _canStartDrain() {
        return this._activeWorkerCount < this._peakInflightCap && this._frameStartsUsed < this._frameStartBudget;
    }
    _startDrain(navState) {
        if (this._draining.has(navState) || navState.hpaReplanRequestId === 0) return false;
        this._frameStartsUsed++;
        this._draining.add(navState);
        void this._drainReplan(navState);
        return true;
    }
    _enqueue(navState) {
        if (this._queuedNavStates.has(navState)) {
            this._resortQueued(navState);
            return;
        }
        this._queuedNavStates.add(navState);
        this._waitQueue.push(navState);
        this._sortWaitQueue();
    }
    _resortQueued(navState) {
        const idx = this._waitQueue.indexOf(navState);
        if (idx >= 0) this._waitQueue.splice(idx, 1);
        this._waitQueue.push(navState);
        this._sortWaitQueue();
    }
    _sortWaitQueue() {
        this._waitQueue.sort((a, b) => (this._replanPriority.get(b) ?? 0) - (this._replanPriority.get(a) ?? 0));
    }
    _pumpQueue() {
        while (this._waitQueue.length > 0 && this._canStartDrain()) {
            const navState = this._waitQueue.shift();
            this._queuedNavStates.delete(navState);
            if (navState.hpaReplanRequestId === 0 || this._draining.has(navState)) continue;
            this._startDrain(navState);
        }
    }
    _recordInflightPeak() {
        if (this._activeWorkerCount > this._peakInflightSeen) this._peakInflightSeen = this._activeWorkerCount;
    }
    _releaseWorkerSlot() {
        this._activeWorkerCount--;
        while (this._slotWaiters.length) this._slotWaiters.shift()();
        this._pumpQueue();
    }
    async _awaitWorkerSlot() {
        while (this._activeWorkerCount >= this._peakInflightCap)
            await new Promise((resolve) => {
                this._slotWaiters.push(resolve);
            });
    }
    async _drainReplan(navState) {
        try {
            while (navState.hpaReplanRequestId !== 0) {
                await this._awaitWorkerSlot();
                if (navState.hpaReplanRequestId === 0) break;
                const requestId = navState.hpaReplanRequestId;
                const request = this._pendingRequests.get(navState);
                this._activeWorkerCount++;
                this._recordInflightPeak();
                let workerOut = null;
                try {
                    workerOut = await this.worker.requestPath(request, navState);
                } catch (err) {
                    console.error("HPA replan failed", err);
                    if (navState.hpaReplanRequestId === requestId) navState.hpaReplanRequestId = 0;
                    break;
                } finally {
                    this._releaseWorkerSlot();
                }
                if (navState.hpaReplanRequestId !== requestId) {
                    if (workerOut?.result?.pathSlot >= 0) this.worker.releaseSlot(workerOut.result.pathSlot);
                    continue;
                }
                navState.hpaReplanRequestId = 0;
                if (!workerOut?.result) this.worker.releaseOwnedPathSlot(navState);
                else request.applyResult(navState, this.worker, workerOut.result);
            }
        } finally {
            this._draining.delete(navState);
            if (navState.hpaReplanRequestId !== 0) this._enqueue(navState);
        }
    }
}
