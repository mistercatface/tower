import { MinHeap } from "../DataStructures/MinHeap.js";
import { groundChunkWorkerDedupeKey, wallAtlasWorkerDedupeKey } from "./SurfaceBakeCacheKeys.js";
import { TILE_WORKER_MESSAGE } from "./TileWorkerMessages.js";
import { TileBakeMetricsAccumulator, isTileBakeMetricsEnabled } from "./TileBakeMetrics.js";
export const TILE_BAKE_TIER = { REGISTRATION: -1, STATIC: 0 };
const FOCUS_RESORT_DIST_SQ = 16 * 16;
function compareJobs(a, b) {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return a.distSq - b.distSq;
}
function profileIdFromPayload(payload) {
    return payload?.profileId ?? payload?.id;
}
function dedupeKeyFor(type, payload, tier, getProfileRevision) {
    if (tier === TILE_BAKE_TIER.REGISTRATION) return null;
    const rev = getProfileRevision(profileIdFromPayload(payload));
    if (type === TILE_WORKER_MESSAGE.BAKE_GROUND_CHUNK) return groundChunkWorkerDedupeKey(payload, rev);
    if (type === TILE_WORKER_MESSAGE.BAKE_WALL_ATLAS) return wallAtlasWorkerDedupeKey(payload, rev);
    return null;
}
/**
 * Priority queue + promise lifecycle for tile surface worker bakes.
 * Job tiers drain registration → static; within a tier jobs sort by distance to focus.
 */
export class TileBakeScheduler {
    constructor(pool, options = {}) {
        this.pool = pool;
        this.getProfileRevision = options.getProfileRevision ?? (() => 0);
        this.queue = new MinHeap(compareJobs);
        this.pending = new Map();
        this.inFlightByKey = new Map();
        this.nextReqId = 1;
        this.focusX = 0;
        this.focusY = 0;
        this.sortFocusX = 0;
        this.sortFocusY = 0;
        this.metricsAccumulator = new TileBakeMetricsAccumulator();
    }
    updateFocus(x, y) {
        this.focusX = x;
        this.focusY = y;
    }
    stats() {
        let busyWorkers = 0;
        if (this.pool._started)
            this.pool.forEachSlot((_index, slot) => {
                if (slot.busy) busyWorkers++;
            });
        return { queueSize: this.queue.size, pendingCount: this.pending.size, inFlightDedupeCount: this.inFlightByKey.size, busyWorkers, bakeTiming: this.metricsAccumulator.averages() };
    }
    enqueue(type, payload, tier) {
        const dedupeKey = dedupeKeyFor(type, payload, tier, this.getProfileRevision);
        if (dedupeKey) {
            const existing = this.inFlightByKey.get(dedupeKey);
            if (existing) return existing;
        }
        const promise = new Promise((resolve, reject) => {
            const id = this.nextReqId++;
            this.pending.set(id, { resolve, reject, dedupeKey });
            const job = { id, type, payload, tier, revision: this.getProfileRevision(profileIdFromPayload(payload)), distSq: this._jobDistSq(payload), dedupeKey };
            this.queue.push(job);
            this._dispatch();
        });
        if (dedupeKey) this.inFlightByKey.set(dedupeKey, promise);
        return promise;
    }
    finishJob(_workerIndex, { id, bitmaps, error, metrics }) {
        if (metrics && isTileBakeMetricsEnabled()) this.metricsAccumulator.record(metrics);
        this._settle(id, bitmaps, error);
        this._dispatch();
    }
    broadcast(type, payload) {
        this.pool.ensureStarted();
        return Promise.all(Array.from({ length: this.pool.size }, () => this.enqueue(type, payload, TILE_BAKE_TIER.REGISTRATION)));
    }
    _jobDistSq(payload) {
        const cx = payload?.centerX ?? this.focusX;
        const cy = payload?.centerY ?? this.focusY;
        return (cx - this.focusX) ** 2 + (cy - this.focusY) ** 2;
    }
    _resortQueueIfNeeded() {
        if (this.queue.size > 1) {
            const movedSq = (this.focusX - this.sortFocusX) ** 2 + (this.focusY - this.sortFocusY) ** 2;
            if (movedSq < FOCUS_RESORT_DIST_SQ) return;
        }
        this.sortFocusX = this.focusX;
        this.sortFocusY = this.focusY;
        const data = this.queue.data;
        for (const job of data) job.distSq = this._jobDistSq(job.payload);
        for (let i = (data.length >> 1) - 1; i >= 0; i--) this.queue.down(i);
    }
    _settle(id, bitmaps, error) {
        const entry = this.pending.get(id);
        if (!entry) return;
        this.pending.delete(id);
        if (entry.dedupeKey) this.inFlightByKey.delete(entry.dedupeKey);
        if (error) entry.reject(new Error(error));
        else entry.resolve(bitmaps);
    }
    _dropIfObsolete(job) {
        const currentRev = this.getProfileRevision(profileIdFromPayload(job.payload));
        if (job.revision !== undefined && job.revision < currentRev) {
            this._settle(job.id, [], null);
            return true;
        }
        return false;
    }
    _popNextJob() {
        while (this.queue.size > 0) {
            const popped = this.queue.pop();
            if (!this.pending.has(popped.id)) continue;
            if (this._dropIfObsolete(popped)) continue;
            return popped;
        }
        return null;
    }
    _dispatch() {
        if (this.queue.size === 0) return;
        this.pool.ensureStarted();
        this._resortQueueIfNeeded();
        this.pool.forEachIdle((wi) => {
            const job = this._popNextJob();
            if (!job) return;
            this.pool.markBusy(wi, { jobId: job.id, tier: job.tier });
            this.pool.postJob(wi, { id: job.id, type: job.type, payload: job.payload });
        });
    }
}
