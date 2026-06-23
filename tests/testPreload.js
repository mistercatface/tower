import { after } from "node:test";
import { createMockCanvas2d } from "./mockCanvas2d.js";
import { installNodeWorkerShim, terminateAllTrackedWorkers } from "./harness/installNodeWorkerShim.js";
import { terminateAllWorkerNavigations, enableTestNavigationTracking } from "../Libraries/Navigation/WorkerNavigationFactory.js";

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

after(async () => {
    await Promise.race([
        (async () => {
            await terminateAllWorkerNavigations();
            await terminateAllTrackedWorkers();
        })(),
        new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
});
