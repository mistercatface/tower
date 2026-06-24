/**
 * Manages caching of flow field slots, index conversions, and worker request dispatching.
 */
export class FlowCacheManager {
    constructor(maxCacheSize, flowWindow) {
        this.maxCacheSize = maxCacheSize;
        this.window = flowWindow;
        this.cacheLookup = new Int32Array(flowWindow.cols * flowWindow.rows).fill(-1);
        this.slotToTargetIdx = new Int32Array(maxCacheSize).fill(-1);
        this.slotToRange = new Int32Array(maxCacheSize).fill(-1);
        this.nextSlotForTarget = new Int32Array(maxCacheSize).fill(-1);
        this.lruList = [];
        this.allocatedCount = 0;
    }
    resize(cols, rows) {
        const size = cols * rows;
        if (this.cacheLookup.length !== size) this.cacheLookup = new Int32Array(size).fill(-1);
        else this.cacheLookup.fill(-1);
        this.slotToTargetIdx.fill(-1);
        this.slotToRange.fill(-1);
        this.nextSlotForTarget.fill(-1);
        this.lruList.length = 0;
        this.allocatedCount = 0;
    }
    invalidate(protocol) {
        this.cacheLookup.fill(-1);
        this.slotToTargetIdx.fill(-1);
        this.slotToRange.fill(-1);
        this.nextSlotForTarget.fill(-1);
        this.lruList.length = 0;
        this.allocatedCount = 0;
        protocol?.invalidateSlots();
    }
    findSlot(targetIdx, range) {
        let slot = this.cacheLookup[targetIdx];
        while (slot !== -1) {
            if (this.slotToRange[slot] === range) return slot;
            slot = this.nextSlotForTarget[slot];
        }
        return -1;
    }
    unlinkSlotFromTarget(slot, targetIdx) {
        let current = this.cacheLookup[targetIdx];
        if (current === slot) {
            this.cacheLookup[targetIdx] = this.nextSlotForTarget[slot];
            this.nextSlotForTarget[slot] = -1;
            return;
        }
        while (current !== -1) {
            const next = this.nextSlotForTarget[current];
            if (next === slot) {
                this.nextSlotForTarget[current] = this.nextSlotForTarget[slot];
                this.nextSlotForTarget[slot] = -1;
                return;
            }
            current = next;
        }
    }
    allocateSlot(targetIdx, range) {
        let slot;
        if (this.allocatedCount < this.maxCacheSize) slot = this.allocatedCount++;
        else {
            slot = this.lruList.shift();
            const oldTargetIdx = this.slotToTargetIdx[slot];
            if (oldTargetIdx !== -1) this.unlinkSlotFromTarget(slot, oldTargetIdx);
        }
        this.slotToTargetIdx[slot] = targetIdx;
        this.slotToRange[slot] = range;
        this.nextSlotForTarget[slot] = this.cacheLookup[targetIdx];
        this.cacheLookup[targetIdx] = slot;
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
        const targetCol = this.window.worldCol(targetX);
        const targetRow = this.window.worldRow(targetY);
        if (targetCol < 0 || targetCol >= this.window.cols || targetRow < 0 || targetRow >= this.window.rows) return null;
        const targetIdx = targetRow * this.window.cols + targetCol;
        const normalizedRange = Number.isFinite(range) ? range | 0 : 999999;
        let slot = this.findSlot(targetIdx, normalizedRange);
        if (slot === -1) {
            slot = this.allocateSlot(targetIdx, normalizedRange);
            protocol.postSlot(slot, { type: "updateFlow", tx: targetCol, ty: targetRow, range: normalizedRange });
        } else this.markUsed(slot);
        return slot;
    }
}
