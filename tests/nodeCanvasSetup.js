import { createMockCanvas2d } from "./mockCanvas2d.js";
import { installNodeWorkerShim } from "./harness/installNodeWorkerShim.js";
installNodeWorkerShim();
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
