import { FlowFieldRequest } from "./flowFieldWindow.js";
/**
 * Manages caching of flow field slots, index conversions, and worker request dispatching.
 */
export class FlowCacheManager {
    constructor(maxCacheSize, flowWindow) {
        this.maxCacheSize = maxCacheSize;
        this.window = flowWindow;
        this.cacheLookup = new Int32Array(flowWindow.cols * flowWindow.rows).fill(-1);
        this.cacheCounter = 0;
    }
    resize(cols, rows) {
        const size = cols * rows;
        if (this.cacheLookup.length !== size) this.cacheLookup = new Int32Array(size).fill(-1);
        else this.cacheLookup.fill(-1);
        this.cacheCounter = 0;
    }
    invalidate(protocol) {
        this.cacheLookup.fill(-1);
        this.cacheCounter = 0;
        protocol?.invalidateSlots();
    }
    allocateSlot(protocol) {
        if (this.cacheCounter >= this.maxCacheSize) this.invalidate(protocol);
        return this.cacheCounter++;
    }
    getOrRequestSlot(targetX, targetY, range, protocol) {
        if (!this.window.ready) return null;
        const request = FlowFieldRequest.fromWorld(this.window, targetX, targetY, range);
        if (!request) return null;
        let slot = this.cacheLookup[request.targetIdx];
        if (slot === -1) {
            slot = this.allocateSlot(protocol);
            this.cacheLookup[request.targetIdx] = slot;
            protocol.postSlot(slot, request.toWorkerPayload());
        }
        return slot;
    }
}
