import { adjustGameZoom, setGameZoomAbsolute } from "../Core/EventSystem.js";
import { controlSettings, COMBAT_HUD_MODE_COUNT, COMBAT_HUD_MODE_LABELS } from "../Config/Config.js";

export class InputManager {
    static setup(canvas, fsm) {
        let lastTapTime = 0;
        let initialPinchDistance = null;
        let initialZoom = 1;

        canvas.addEventListener(
            "wheel",
            (e) => {
                e.preventDefault();
                const zoomAmount = e.deltaY * controlSettings.scrollZoomSensitivity;
                adjustGameZoom(zoomAmount);
            },
            { passive: false },
        );

        canvas.addEventListener(
            "touchstart",
            (e) => {
                if (e.touches.length === 2) {
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    initialPinchDistance = Math.hypot(dx, dy);
                    initialZoom = fsm.context.viewport.zoom;
                }
            },
            { passive: false },
        );

        canvas.addEventListener(
            "touchmove",
            (e) => {
                if (e.touches.length === 2 && initialPinchDistance) {
                    e.preventDefault();
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    const currentDistance = Math.hypot(dx, dy);
                    const ratio = currentDistance / initialPinchDistance;
                    setGameZoomAbsolute(initialZoom * ratio);
                }
            },
            { passive: false },
        );

        canvas.addEventListener("touchend", (e) => {
            if (e.touches.length < 2) {
                initialPinchDistance = null;
            }
        });

        canvas.addEventListener("pointerdown", (e) => {
            const currentTime = Date.now();
            const isDoubleTap = currentTime - lastTapTime < controlSettings.doubleTapTimeout;
            lastTapTime = currentTime;
            const rect = canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            const worldCoords = fsm.context.viewport.screenToWorld(screenX, screenY);
            fsm.handleInteraction(worldCoords, isDoubleTap);
        });

        canvas.addEventListener("pointermove", (e) => {
            const rect = canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            const worldCoords = fsm.context.viewport.screenToWorld(screenX, screenY);
            if (fsm.currentState && fsm.currentState.handlePointerMove) {
                fsm.currentState.handlePointerMove(worldCoords, { x: screenX, y: screenY }, e.buttons === 1, fsm.context);
            }
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
        });
    }
}
