import { FlowFieldRequest } from "./flowFieldWindow.js";
/**
 * Manages caching of flow field slots, index conversions, and worker request dispatching.
 */
export class FlowCacheManager {
    constructor(maxCacheSize, flowWindow) {
        this.maxCacheSize = maxCacheSize;
        this.window = flowWindow;
        this.cacheLookup = new Int32Array(flowWindow.cols * flowWindow.rows).fill(-1);
        this.slotToTargetIdx = new Int32Array(maxCacheSize).fill(-1);
        this.lruList = [];
        this.allocatedCount = 0;
    }
    resize(cols, rows) {
        const size = cols * rows;
        if (this.cacheLookup.length !== size) this.cacheLookup = new Int32Array(size).fill(-1);
        else this.cacheLookup.fill(-1);
        this.slotToTargetIdx.fill(-1);
        this.lruList.length = 0;
        this.allocatedCount = 0;
    }
    invalidate(protocol) {
        this.cacheLookup.fill(-1);
        this.slotToTargetIdx.fill(-1);
        this.lruList.length = 0;
        this.allocatedCount = 0;
        protocol?.invalidateSlots();
    }
    allocateSlot(targetIdx) {
        let slot;
        if (this.allocatedCount < this.maxCacheSize) {
            slot = this.allocatedCount++;
        } else {
            slot = this.lruList.shift();
            const oldTargetIdx = this.slotToTargetIdx[slot];
            if (oldTargetIdx !== -1) {
                this.cacheLookup[oldTargetIdx] = -1;
            }
        }
        this.slotToTargetIdx[slot] = targetIdx;
        this.lruList.push(slot);
        return slot;
    }
    markUsed(slot) {
        const idx = this.lruList.indexOf(slot);
        if (idx !== -1) {
            this.lruList.splice(idx, 1);
            this.lruList.push(slot);
        }
    }
    getOrRequestSlot(targetX, targetY, range, protocol) {
        if (!this.window.ready) return null;
        const request = FlowFieldRequest.fromWorld(this.window, targetX, targetY, range);
        if (!request) return null;
        const targetIdx = request.targetIdx;
        let slot = this.cacheLookup[targetIdx];
        if (slot === -1) {
            slot = this.allocateSlot(targetIdx);
            this.cacheLookup[targetIdx] = slot;
            protocol.postSlot(slot, request.toWorkerPayload());
        } else {
            this.markUsed(slot);
        }
        return slot;
    }
}

