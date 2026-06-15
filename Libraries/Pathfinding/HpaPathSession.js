import { applyHpaReplanResult, clearHpaNavPath } from "./hpaPathPlan.js";
/**
 * Async HPA replan controller — one leased worker slot per in-flight replan per navState.
 * Coalesces superseding requests; keeps last good path until apply.
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
    async _drainReplan(navState) {
        try {
            while (navState.hpaReplanRequestId !== 0) {
                const requestId = navState.hpaReplanRequestId;
                const params = this._pendingParams.get(navState);
                const slot = this.worker.leaseSlot(navState);
                navState.hpaReplanSlot = slot;
                const replanCtx = { hpaWorker: this.worker, hpaSlot: slot };
                let result = null;
                try {
                    result = await this.hierarchicalNavigator.computeCellPath(params.startX, params.startY, params.targetX, params.targetY, replanCtx);
                } catch (err) {
                    console.error("HPA replan failed", err);
                }
                this.worker.releaseSlot(slot);
                navState.hpaReplanSlot = -1;
                if (navState.hpaReplanRequestId !== requestId) continue;
                navState.hpaReplanRequestId = 0;
                if (!result) clearHpaNavPath(navState);
                else applyHpaReplanResult(navState, result, params);
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
