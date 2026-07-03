import { after } from "node:test";
import { createMockCanvas2d } from "./mockCanvas2d.js";
import { installNodeWorkerShim, terminateAllTrackedWorkers } from "./harness/installNodeWorkerShim.js";
import { terminateAllWorkerNavigations, enableTestNavigationTracking } from "./WorkerNavigationFactory.js";

installNodeWorkerShim();
enableTestNavigationTracking();

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
    globalThis.createImageBitmap = async (source) => ({
        width: source.width ?? 0,
        height: source.height ?? 0,
        close() {},
    });
}

after(async () => {
    await Promise.race([
        (async () => {
            await terminateAllWorkerNavigations();
            await terminateAllTrackedWorkers();
        })(),
        new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
});
