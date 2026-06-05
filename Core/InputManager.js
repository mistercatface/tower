import { adjustGameZoom, setGameZoomAbsolute, emitMapToggle } from "./EventSystem.js";
import { controlSettings, COMBAT_HUD_MODE_COUNT, COMBAT_HUD_MODE_LABELS } from "../Config/Config.js";
import {
    DoubleTapDetector,
    PinchZoomGesture,
    bindWheelZoom,
    bindCanvasPointerDown,
    bindCanvasPointerMove,
} from "../Libraries/Input/index.js";

export class InputManager {
    static setup(canvas, fsm) {
        const doubleTap = new DoubleTapDetector(controlSettings.doubleTapTimeout);

        bindWheelZoom(canvas, (delta) => adjustGameZoom(delta), {
            sensitivity: controlSettings.scrollZoomSensitivity,
        });

        new PinchZoomGesture(canvas, {
            getBaseZoom: () => fsm.context.viewport.zoom,
            onPinchZoom: setGameZoomAbsolute,
        });

        bindCanvasPointerDown(canvas, {
            screenToWorld: (screenX, screenY) => fsm.context.viewport.screenToWorld(screenX, screenY),
            onPointerDown: (worldCoords, _screen, _e) => {
                fsm.handleInteraction(worldCoords, doubleTap.registerTap());
            },
        });

        bindCanvasPointerMove(canvas, {
            screenToWorld: (screenX, screenY) => fsm.context.viewport.screenToWorld(screenX, screenY),
            onPointerMove: (worldCoords, screen, e) => {
                if (fsm.currentState?.handlePointerMove) {
                    fsm.currentState.handlePointerMove(worldCoords, screen, e.buttons === 1, fsm.context);
                }
            },
        });

        window.addEventListener("keydown", (e) => {
            if (e.key === "d" || e.key === "D") {
                fsm.context.state.debugMode = !fsm.context.state.debugMode;
                console.log("Debug Mode: " + fsm.context.state.debugMode);
            }
            if (e.key === "h" || e.key === "H") {
                const state = fsm.context.state;
                state.combatHudMode = (state.combatHudMode + 1) % COMBAT_HUD_MODE_COUNT;
                console.log("Combat HUD Mode: " + COMBAT_HUD_MODE_LABELS[state.combatHudMode]);
            }
            if (e.key === "m" || e.key === "M") {
                emitMapToggle();
            }
        });
    }
}
