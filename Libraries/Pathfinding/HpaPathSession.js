import { applyHpaAbstractFirst, applyHpaReplanResult, clearHpaNavPath } from "./hpaPathPlan.js";
/**
 * Async HPA replan controller — one leased worker slot per in-flight replan per navState.
 * Coalesces superseding requests; keeps last good path until apply.
 */
export class HpaPathSession {
    /** @param {import("./HpaPathWorker.js").HpaPathWorker} hpaPathWorker */
    constructor(hpaPathWorker) {
        this.worker = hpaPathWorker;
        this._nextRequestId = 1;
        /** @type {WeakMap<import("./navSession.js").NavSessionState, object>} */
        this._pendingParams = new WeakMap();
        /** @type {WeakSet<import("./navSession.js").NavSessionState>} */
        this._draining = new WeakSet();
    }
    isReplanInFlight(navState) {
        return navState.hpaReplanRequestId !== 0;
    }
    requestReplan(navState, params) {
        this._pendingParams.set(navState, params);
        navState.hpaReplanRequestId = this._nextRequestId++;
        if (!this._draining.has(navState)) {
            this._draining.add(navState);
            void this._drainReplan(navState);
        }
    }
    async _drainReplan(navState) {
        try {
            while (navState.hpaReplanRequestId !== 0) {
                const requestId = navState.hpaReplanRequestId;
                const params = this._pendingParams.get(navState);
                const replanCtx = {
                    replanRequestId: requestId,
                    onAbstractReady: (abstractResult) => {
                        if (navState.hpaReplanRequestId !== requestId) return;
                        applyHpaAbstractFirst(navState, abstractResult, params);
                    },
                };
                let workerOut = null;
                try {
                    workerOut = await this.worker.requestPath({
                        obstacleGrid: params.obstacleGrid,
                        startX: params.startX,
                        startY: params.startY,
                        targetX: params.targetX,
                        targetY: params.targetY,
                        graphEpoch: params.graphEpoch,
                        navState,
                        ...replanCtx,
                    });
                } catch (err) {
                    console.error("HPA replan failed", err);
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
            if (navState.hpaReplanRequestId !== 0) {
                this._draining.add(navState);
                void this._drainReplan(navState);
            }
        }
    }
}
