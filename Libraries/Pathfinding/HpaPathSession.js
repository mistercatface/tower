import { applyHpaAbstractFirst, applyHpaReplanResult, clearHpaNavPath } from "./hpaPathPlan.js";
/**
 * Async HPA replan controller — one leased worker slot per in-flight replan per navState.
 * Coalesces superseding requests; keeps last good path until apply.
 * Abstract-first: coarse region waypoints while worker finishes temp-connect, then first leg, then full stitch.
 */
export class HpaPathSession {
    constructor(hpaPathWorker, hierarchicalNavigator) {
        this.worker = hpaPathWorker;
        this.hierarchicalNavigator = hierarchicalNavigator;
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
    _finishFullStitch(navState, requestId, stitch, params) {
        const fullCellPath = this.hierarchicalNavigator.stitchAbstractCellPath(stitch.abstractIdx, stitch.prep, stitch.tempLegs);
        const fullResult = this.hierarchicalNavigator._workerReplanResult(fullCellPath, stitch.prep, stitch.abstractIdx);
        if (navState.hpaReplanRequestId !== 0) return;
        if (navState.hpaStitchRequestId !== requestId) return;
        if (!fullResult) clearHpaNavPath(navState);
        else applyHpaReplanResult(navState, fullResult, params);
    }
    async _drainReplan(navState) {
        try {
            while (navState.hpaReplanRequestId !== 0) {
                const requestId = navState.hpaReplanRequestId;
                const params = this._pendingParams.get(navState);
                const slot = this.worker.leaseSlot(navState);
                navState.hpaReplanSlot = slot;
                const replanCtx = {
                    hpaWorker: this.worker,
                    hpaSlot: slot,
                    graphEpoch: params.graphEpoch,
                    replanRequestId: requestId,
                    onAbstractReady: (abstractResult) => {
                        if (navState.hpaReplanRequestId !== requestId) return;
                        applyHpaAbstractFirst(navState, abstractResult, params);
                    },
                };
                let workerOut = null;
                try {
                    workerOut = await this.hierarchicalNavigator.computeCellPath(params.startX, params.startY, params.targetX, params.targetY, replanCtx);
                } catch (err) {
                    console.error("HPA replan failed", err);
                }
                this.worker.releaseSlot(slot);
                navState.hpaReplanSlot = -1;
                if (navState.hpaReplanRequestId !== requestId) continue;
                navState.hpaReplanRequestId = 0;
                if (!workerOut?.result) clearHpaNavPath(navState);
                else {
                    applyHpaReplanResult(navState, workerOut.result, params);
                    if (!workerOut.complete && workerOut.stitch) {
                        navState.hpaStitchRequestId = requestId;
                        queueMicrotask(() => this._finishFullStitch(navState, requestId, workerOut.stitch, params));
                    }
                }
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
