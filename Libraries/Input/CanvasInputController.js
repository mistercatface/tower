import { DoubleTapDetector } from "./DoubleTapDetector.js";
import { PinchZoomGesture } from "./PinchZoomGesture.js";
import { bindWheelZoom } from "./WheelZoomHandler.js";
import { bindCanvasPointerDown, bindCanvasPointerMove, bindCanvasPointerUp } from "./canvasPointer.js";
import { bindKeyDown } from "./keyboardBindings.js";

/** @typedef {import("./keyboardBindings.js").KeyBinding} KeyBinding */

/**
 * @typedef {object} CanvasInputConfig
 * @property {(screenX: number, screenY: number) => { x: number, y: number }} screenToWorld
 * @property {number} [doubleTapTimeoutMs]
 * @property {number} [wheelZoomSensitivity]
 * @property {(delta: number) => void} [onWheelZoomDelta]
 * @property {() => number} [getBaseZoom]
 * @property {(zoom: number) => void} [onPinchZoom]
 * @property {(world: { x: number, y: number }, screen: { x: number, y: number }, isDoubleTap: boolean, event: PointerEvent) => void} [onPointerDown]
 * @property {(world: { x: number, y: number }, screen: { x: number, y: number }, isPrimaryDown: boolean, event: PointerEvent) => void} [onPointerMove]
 * @property {(world: { x: number, y: number }, screen: { x: number, y: number }, event: PointerEvent) => void} [onPointerUp]
 * @property {KeyBinding[]} [keyBindings]
 * @property {Window | Document | HTMLElement} [keyboardTarget]
 */

/**
 * Owns canvas pointer, wheel, pinch, and optional keyboard bindings.
 * Game code passes callbacks only — no raw addEventListener in glue.
 */
export class CanvasInputController {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {CanvasInputConfig} config
     */
    constructor(canvas, config) {
        this.canvas = canvas;
        this.config = config;
        this._cleanups = [];
        this._doubleTap = new DoubleTapDetector(config.doubleTapTimeoutMs ?? 300);
        this._pinch = null;

        if (config.onWheelZoomDelta) {
            this._cleanups.push(bindWheelZoom(canvas, config.onWheelZoomDelta, { sensitivity: config.wheelZoomSensitivity ?? 1 }));
        }

        if (config.onPinchZoom && config.getBaseZoom) {
            this._pinch = new PinchZoomGesture(canvas, { getBaseZoom: config.getBaseZoom, onPinchZoom: config.onPinchZoom });
        }

        if (config.onPointerDown) {
            this._cleanups.push(
                bindCanvasPointerDown(canvas, {
                    screenToWorld: config.screenToWorld,
                    onPointerDown: (world, screen, e) => {
                        config.onPointerDown(world, screen, this._doubleTap.registerTap(), e);
                    },
                }),
            );
        }

        if (config.onPointerMove) {
            this._cleanups.push(
                bindCanvasPointerMove(canvas, {
                    screenToWorld: config.screenToWorld,
                    onPointerMove: (world, screen, e) => {
                        config.onPointerMove(world, screen, (e.buttons & 1) !== 0, e);
                    },
                }),
            );
        }

        if (config.onPointerUp) {
            this._cleanups.push(
                bindCanvasPointerUp(canvas, {
                    screenToWorld: config.screenToWorld,
                    onPointerUp: (world, screen, e) => {
                        config.onPointerUp(world, screen, e);
                    },
                }),
            );
        }

        if (config.keyBindings?.length) {
            const target = config.keyboardTarget ?? window;
            this._cleanups.push(bindKeyDown(target, config.keyBindings));
        }
    }

    destroy() {
        for (let i = 0; i < this._cleanups.length; i++) {
            this._cleanups[i]();
        }
        this._cleanups.length = 0;
        this._pinch?.destroy();
        this._pinch = null;
    }
}
