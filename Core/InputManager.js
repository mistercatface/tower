import { adjustGameZoom, setGameZoomAbsolute, emitMapToggle } from "./EventSystem.js";
import { controlSettings, COMBAT_HUD_MODE_COUNT, COMBAT_HUD_MODE_LABELS } from "../Config/Config.js";
import { CanvasInputController } from "../Libraries/Input/CanvasInputController.js";

/** @type {CanvasInputController | null} */
let activeController = null;

export class InputManager {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {import("../GameState/GameStateMachine.js").GameStateMachine} fsm
     * @returns {CanvasInputController}
     */
    static setup(canvas, fsm) {
        activeController?.destroy();
        activeController = new CanvasInputController(canvas, {
            doubleTapTimeoutMs: controlSettings.doubleTapTimeout,
            wheelZoomSensitivity: controlSettings.scrollZoomSensitivity,
            onWheelZoomDelta: adjustGameZoom,
            getBaseZoom: () => fsm.context.viewport.zoom,
            onPinchZoom: setGameZoomAbsolute,
            screenToWorld: (screenX, screenY) => fsm.context.viewport.screenToWorld(screenX, screenY),
            onPointerDown: (worldCoords, _screen, isDoubleTap, event) => {
                const state = fsm.currentState;
                const ctx = fsm.context;
                if (state?.handlePointerDown) {
                    state.handlePointerDown(worldCoords, isDoubleTap, event, ctx);
                } else {
                    fsm.handleInteraction(worldCoords, isDoubleTap);
                }
            },
            onPointerMove: (worldCoords, screen, isPrimaryDown) => {
                fsm.currentState?.handlePointerMove?.(worldCoords, screen, isPrimaryDown, fsm.context);
            },
            onPointerUp: (worldCoords, _screen, event) => {
                fsm.currentState?.handlePointerUp?.(worldCoords, event, fsm.context);
            },
            keyBindings: [
                {
                    key: "d",
                    onPress: () => {
                        fsm.context.state.debugMode = !fsm.context.state.debugMode;
                        console.log("Debug Mode: " + fsm.context.state.debugMode);
                    },
                },
                {
                    key: "h",
                    onPress: () => {
                        const state = fsm.context.state;
                        state.combatHudMode = (state.combatHudMode + 1) % COMBAT_HUD_MODE_COUNT;
                        console.log("Combat HUD Mode: " + COMBAT_HUD_MODE_LABELS[state.combatHudMode]);
                    },
                },
                { key: "m", onPress: () => emitMapToggle() },
            ],
        });
        return activeController;
    }
}
