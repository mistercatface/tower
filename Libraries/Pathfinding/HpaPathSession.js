import { applyHpaReplanResult, clearHpaNavPath } from "./hpaPathPlan.js";
import { HPA_REPLAN_FRAME_START_BUDGET, HPA_REPLAN_PEAK_INFLIGHT_CAP } from "./hpaReplanPolicy.js";
import { MAX_HPA_REPLAN_SLOTS } from "./HpaPathWorker.js";
export class HpaPathSession {
    constructor(hpaPathWorker, { frameStartBudget = HPA_REPLAN_FRAME_START_BUDGET, peakInflightCap = HPA_REPLAN_PEAK_INFLIGHT_CAP } = {}) {
        this.worker = hpaPathWorker;
        this._frameStartBudget = frameStartBudget;
        this._peakInflightCap = Math.min(peakInflightCap, MAX_HPA_REPLAN_SLOTS);
        this._nextRequestId = 1;
        this._pendingParams = new WeakMap();
        this._replanPriority = new WeakMap();
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
    requestReplan(navState, params, priority = 0) {
        this._pendingParams.set(navState, params);
        this._replanPriority.set(navState, priority);
        navState.hpaReplanRequestId = this._nextRequestId++;
        if (this._draining.has(navState)) return;
        this._enqueue(navState);
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
                const requestId = navState.hpaReplanRequestId;
                const params = this._pendingParams.get(navState);
                this._activeWorkerCount++;
                this._recordInflightPeak();
                let workerOut = null;
                try {
                    console.log("HpaPathSession sending requestPath to worker:", {
                        startX: params.startX,
                        startY: params.startY,
                        targetX: params.targetX,
                        targetY: params.targetY,
                        graphEpoch: params.graphEpoch,
                        replanRequestId: requestId,
                    });
                    workerOut = await this.worker.requestPath({
                        obstacleGrid: params.obstacleGrid,
                        startX: params.startX,
                        startY: params.startY,
                        targetX: params.targetX,
                        targetY: params.targetY,
                        graphEpoch: params.graphEpoch,
                        stepPenalty: params.stepPenalty ?? null,
                        navState,
                        replanRequestId: requestId,
                    });
                    console.log("HpaPathSession received requestPath response from worker:", {
                        replanRequestId: requestId,
                        success: !!workerOut?.result,
                        pathLen: workerOut?.result?.pathLen,
                        pathSlot: workerOut?.result?.pathSlot,
                    });
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
                if (!workerOut?.result) clearHpaNavPath(navState, this.worker);
                else applyHpaReplanResult(navState, workerOut.result, { ...params, worker: this.worker });
            }
        } finally {
            this._draining.delete(navState);
            if (navState.hpaReplanRequestId !== 0) this._enqueue(navState);
        }
    }
}
