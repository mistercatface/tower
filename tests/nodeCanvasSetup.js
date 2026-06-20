import { createMockCanvas2d } from "./mockCanvas2d.js";
import { after } from "node:test";
import { installNodeWorkerShim, terminateAllTrackedWorkers } from "./harness/installNodeWorkerShim.js";
import { terminateAllWorkerNavigations, enableTestNavigationTracking } from "../Libraries/Navigation/WorkerNavigationFactory.js";

installNodeWorkerShim();
enableTestNavigationTracking();

after(async () => {
    await terminateAllWorkerNavigations();
    await terminateAllTrackedWorkers();
});

if (typeof globalThis.OffscreenCanvas === "undefined")
    globalThis.OffscreenCanvas = class OffscreenCanvas {
        constructor(width, height) {
            this.width = width;
            this.height = height;
        }
        getContext() {
            return createMockCanvas2d(this.width, this.height);
        }
    };
