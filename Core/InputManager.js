import { controlSettings } from "../Config/Config.js";
import { getActiveGameDefinition } from "./ActiveGameDefinition.js";
import { CanvasInputController } from "../Libraries/Input/CanvasInputController.js";
/** @type {CanvasInputController | null} */
let activeController = null;
/** @param {import("../Libraries/FSM/StateMachine.js").StateMachine} fsm */
function buildKeyBindings(fsm) {
    return getActiveGameDefinition().keyBindings?.(fsm) ?? [];
}
export class InputManager {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {import("../Libraries/FSM/StateMachine.js").StateMachine} fsm
     * @returns {CanvasInputController}
     */
    static setup(canvas, fsm) {
        activeController?.destroy();
        const input = getActiveGameDefinition().input;
        activeController = new CanvasInputController(canvas, {
            doubleTapTimeoutMs: controlSettings.doubleTapTimeout,
            wheelZoomSensitivity: controlSettings.scrollZoomSensitivity,
            onWheelZoomDelta: input?.onWheelZoomDelta,
            getBaseZoom: input?.onPinchZoom ? () => fsm.context.viewport.zoom : undefined,
            onPinchZoom: input?.onPinchZoom,
            screenToWorld: (screenX, screenY) => fsm.context.viewport.screenToWorld(screenX, screenY),
            onPointerDown: (worldCoords, _screen, isDoubleTap, event) => {
                const state = fsm.currentState;
                const ctx = fsm.context;
                if (state?.handlePointerDown) state.handlePointerDown(worldCoords, isDoubleTap, event, ctx);
                else fsm.handleInteraction(worldCoords, isDoubleTap);
            },
            onPointerMove: (worldCoords, screen, isPrimaryDown) => {
                fsm.currentState?.handlePointerMove?.(worldCoords, screen, isPrimaryDown, fsm.context);
            },
            onPointerUp: (worldCoords, _screen, event) => {
                fsm.currentState?.handlePointerUp?.(worldCoords, event, fsm.context);
            },
            keyBindings: buildKeyBindings(fsm),
        });
        return activeController;
    }
}
