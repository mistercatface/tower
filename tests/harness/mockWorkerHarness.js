export function createMockWorker() {
    return { onmessage: null, onerror: null, postMessage() {}, terminate() {} };
}

export function createMockBitmapWorker() {
    return {
        onmessage: null,
        onerror: null,
        postMessage(message) {
            queueMicrotask(() => {
                this.onmessage?.({ data: { id: message.id, bitmaps: ["mock-bitmap"] } });
            });
        },
        terminate() {},
    };
}
