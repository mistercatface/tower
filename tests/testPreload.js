import { after } from "node:test";
import { createMockCanvas2d } from "./mockCanvas2d.js";
import { installNodeWorkerShim, terminateAllTrackedWorkers } from "./harness/installNodeWorkerShim.js";
import { terminateAllWorkerNavigations, enableTestNavigationTracking } from "./WorkerNavigationFactory.js";

installNodeWorkerShim();
enableTestNavigationTracking();

if (typeof globalThis.ImageBitmap === "undefined") {
    globalThis.ImageBitmap = class ImageBitmap {
        constructor(width = 0, height = 0) {
            this.width = width;
            this.height = height;
        }
        close() {}
    };
}
if (typeof globalThis.OffscreenCanvas === "undefined") {
    globalThis.OffscreenCanvas = class OffscreenCanvas {
        constructor(width, height) {
            this.width = width;
            this.height = height;
        }
        getContext() {
            return createMockCanvas2d(this.width, this.height);
        }
    };
}
if (typeof globalThis.createImageBitmap === "undefined") {
    globalThis.createImageBitmap = async (source) =>
        new globalThis.ImageBitmap(source.width ?? 0, source.height ?? 0);
}

after(async () => {
    let settleTimer;
    try {
        await Promise.race([
            (async () => {
                await terminateAllWorkerNavigations();
                await terminateAllTrackedWorkers();
            })(),
            new Promise((resolve) => {
                settleTimer = setTimeout(resolve, 2000);
            }),
        ]);
    } finally {
        clearTimeout(settleTimer);
    }
});
