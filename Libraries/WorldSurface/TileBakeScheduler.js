import { MinHeap } from "../DataStructures/MinHeap.js";
export const TILE_BAKE_TIER = { REGISTRATION: -1, STATIC: 0, ANIMATION: 1 };
const FOCUS_RESORT_DIST_SQ = 16 * 16;
function compareJobs(a, b) {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return a.distSq - b.distSq;
}
function horizontalZCacheTag(zLevel = 0) {
    return zLevel > 0 ? `z${zLevel}roof` : `z${zLevel}`;
}
function bakeFrameTag(payload) {
    const start = payload.frameStart ?? 0;
    const count = payload.frameCount ?? 1;
    return `${start}+${count}`;
}
function chunkDedupeKey(payload, rev) {
    const zTag = horizontalZCacheTag(payload.zLevel);
    return `chunk:${payload.profileId}:${rev}:${zTag}:${payload.chunkCol},${payload.chunkRow}:${payload.seed ?? 0}:${bakeFrameTag(payload)}`;
}
function patchDedupeKey(payload, rev) {
    const zTag = horizontalZCacheTag(payload.zLevel);
    return `patch:${payload.profileId}:${rev}:${zTag}:${payload.originX.toFixed(1)},${payload.originY.toFixed(1)}:${payload.worldWidth.toFixed(1)}x${payload.worldHeight.toFixed(1)}:${payload.seed ?? 0}:${bakeFrameTag(payload)}`;
}
function wallAtlasDedupeKey(payload, rev) {
    const p1 = payload.p1;
    const p2 = payload.p2;
    return `wall:${payload.profileId}:${rev}:${p1.x.toFixed(1)},${p1.y.toFixed(1)}-${p2.x.toFixed(1)},${p2.y.toFixed(1)}:${payload.width}x${payload.height}:${payload.wallHeight ?? 0}:${payload.seed ?? 0}:${bakeFrameTag(payload)}`;
}
function dedupeKeyFor(type, payload, tier, getProfileRevision) {
    if (tier === TILE_BAKE_TIER.REGISTRATION) return null;
    const rev = getProfileRevision(payload?.profileId);
    if (type === "bakeGroundChunk") return chunkDedupeKey(payload, rev);
    if (type === "bakeHorizontalPatch") return patchDedupeKey(payload, rev);
    if (type === "bakeWallAtlas") return wallAtlasDedupeKey(payload, rev);
    return null;
}
/**
 * Priority queue + promise lifecycle for tile surface worker bakes.
 * Job tiers drain registration → static → animation; within a tier jobs sort by distance to focus.
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
        this.queueNeedsSort = false;
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
        return { queueSize: this.queue.size, pendingCount: this.pending.size, inFlightDedupeCount: this.inFlightByKey.size, busyWorkers };
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
            const job = { id, type, payload, tier, revision: this.getProfileRevision(payload?.profileId), distSq: this._jobDistSq(payload), dedupeKey };
            this.queue.push(job);
            this._dispatch();
        });
        if (dedupeKey) this.inFlightByKey.set(dedupeKey, promise);
        return promise;
    }
    finishJob(_workerIndex, { id, bitmaps, error }) {
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
        if (!this.queueNeedsSort && this.queue.size > 1) {
            const movedSq = (this.focusX - this.sortFocusX) ** 2 + (this.focusY - this.sortFocusY) ** 2;
            if (movedSq < FOCUS_RESORT_DIST_SQ) return;
        }
        this.queueNeedsSort = false;
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
        const currentRev = this.getProfileRevision(job.payload?.profileId);
        if (job.revision !== undefined && job.revision < currentRev) {
            this._settle(job.id, [], null);
            return true;
        }
        return false;
    }
    _popNextJob(activeAnimations, maxAnimations) {
        while (this.queue.size > 0) {
            const candidate = this.queue.data[0];
            if (candidate.tier === TILE_BAKE_TIER.ANIMATION && activeAnimations >= maxAnimations) break;
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
        let activeAnimations = 0;
        this.pool.forEachSlot((_wi, slot) => {
            if (slot.busy && slot.meta?.tier === TILE_BAKE_TIER.ANIMATION) activeAnimations++;
        });
        const maxAnimations = Math.max(1, this.pool.size - 2);
        this.pool.forEachIdle((wi) => {
            const job = this._popNextJob(activeAnimations, maxAnimations);
            if (!job) return;
            if (job.tier === TILE_BAKE_TIER.ANIMATION) activeAnimations++;
            this.pool.markBusy(wi, { jobId: job.id, tier: job.tier });
            this.pool.postJob(wi, { id: job.id, type: job.type, payload: job.payload });
        });
    }
}
