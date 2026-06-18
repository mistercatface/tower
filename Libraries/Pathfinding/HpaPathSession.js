import { applyHpaReplanResult, clearHpaNavPath } from "./hpaPathPlan.js";
import { MAX_HPA_REPLAN_SLOTS } from "./HpaPathWorker.js";
/**
 * Async HPA replan controller — one leased worker slot per in-flight replan per navState.
 * Coalesces superseding requests; keeps last good path until apply.
 * Caps concurrent worker replans at MAX_HPA_REPLAN_SLOTS with a priority wait queue.
 */
export class HpaPathSession {
    /** @param {import("./HpaPathWorker.js").HpaPathWorker} hpaPathWorker */
    constructor(hpaPathWorker) {
        this.worker = hpaPathWorker;
        this._nextRequestId = 1;
        /** @type {WeakMap<import("./navSession.js").NavSessionState, object>} */
        this._pendingParams = new WeakMap();
        /** @type {WeakMap<import("./navSession.js").NavSessionState, number>} */
        this._replanPriority = new WeakMap();
        /** @type {WeakSet<import("./navSession.js").NavSessionState>} */
        this._draining = new WeakSet();
        /** @type {WeakSet<import("./navSession.js").NavSessionState>} */
        this._queuedNavStates = new WeakSet();
        /** @type {import("./navSession.js").NavSessionState[]} */
        this._waitQueue = [];
        this._activeWorkerCount = 0;
        this._slotWaiters = [];
    }
    isReplanInFlight(navState) {
        return navState.hpaReplanRequestId !== 0;
    }
    requestReplan(navState, params, priority = 0) {
        this._pendingParams.set(navState, params);
        this._replanPriority.set(navState, priority);
        navState.hpaReplanRequestId = this._nextRequestId++;
        if (this._draining.has(navState)) return;
        this._tryStartDrain(navState);
    }
    _tryStartDrain(navState) {
        if (this._draining.has(navState) || navState.hpaReplanRequestId === 0) return;
        if (this._activeWorkerCount >= MAX_HPA_REPLAN_SLOTS) {
            this._enqueue(navState);
            return;
        }
        this._draining.add(navState);
        void this._drainReplan(navState);
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
        while (this._waitQueue.length > 0 && this._activeWorkerCount < MAX_HPA_REPLAN_SLOTS) {
            const navState = this._waitQueue.shift();
            this._queuedNavStates.delete(navState);
            if (navState.hpaReplanRequestId === 0 || this._draining.has(navState)) continue;
            this._draining.add(navState);
            void this._drainReplan(navState);
        }
    }
    _releaseWorkerSlot() {
        this._activeWorkerCount--;
        while (this._slotWaiters.length) this._slotWaiters.shift()();
        this._pumpQueue();
    }
    async _awaitWorkerSlot() {
        while (this._activeWorkerCount >= MAX_HPA_REPLAN_SLOTS)
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
                let workerOut = null;
                try {
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
            if (navState.hpaReplanRequestId !== 0) this._tryStartDrain(navState);
        }
    }
}
