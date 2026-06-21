/**
 * Shared-buffer slot worker host: requestId handshake per slot.
 * FlowFieldGrid polls isReady; HpaPathWorker awaits waitForSlot (Promise).
 *
 * @param {URL | string} workerUrl
 * @param {number} slotCount
 */
export function createSabSlotWorkerHost(workerUrl, slotCount) {
    const slotRequestId = new Int32Array(slotCount);
    const slotReadyId = new Int32Array(slotCount);
    /** @type {Map<number, { want: number, resolve: () => void }>} */
    const waiters = new Map();
    const worker = new Worker(workerUrl, { type: "module" });
    return {
        worker,
        slotRequestId,
        slotReadyId,
        markReady(slot, requestId) {
            slotReadyId[slot] = requestId;
            const waiter = waiters.get(slot);
            if (waiter && waiter.want === requestId) {
                waiters.delete(slot);
                waiter.resolve();
            }
        },
        post(slot, payload) {
            let requestId = (slotRequestId[slot] + 1) | 0;
            if (requestId === 0) requestId = 1;
            slotRequestId[slot] = requestId;
            worker.postMessage({ ...payload, slot, requestId });
            return requestId;
        },
        isReady(slot) {
            const requestId = slotRequestId[slot];
            return requestId > 0 && slotReadyId[slot] === requestId;
        },
        waitForSlot(slot, requestId) {
            if (slotReadyId[slot] === requestId) return Promise.resolve();
            return new Promise((resolve) => waiters.set(slot, { want: requestId, resolve }));
        },
        invalidateSlots() {
            slotRequestId.fill(0);
            slotReadyId.fill(0);
            for (const waiter of waiters.values())
                try {
                    waiter.resolve();
                } catch (e) {}
            waiters.clear();
        },
    };
}
