import { showNodeConfirm } from "./UI.js";
import { controlSettings } from "./Config.js";

export class InputManager {
    static setup(canvas, fsm, viewport) {
        let lastTapTime = 0;
        let initialPinchDistance = null;
        let initialZoom = 1;

        canvas.addEventListener(
            "wheel",
            (e) => {
                e.preventDefault();
                const zoomAmount = e.deltaY * controlSettings.scrollZoomSensitivity;
                viewport.setZoom(viewport.zoom + zoomAmount, fsm.context.state);
                fsm.context.updateUI(fsm.context.state, fsm.context.upgrades);
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
                    initialZoom = viewport.zoom;
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
                    viewport.setZoom(initialZoom * ratio, fsm.context.state);
                    fsm.context.updateUI(fsm.context.state, fsm.context.upgrades);
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
            const worldCoords = viewport.screenToWorld(screenX, screenY);
            fsm.handleInteraction(worldCoords, isDoubleTap);
        });

        canvas.addEventListener("pointermove", (e) => {
            const rect = canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            const worldCoords = viewport.screenToWorld(screenX, screenY);
            if (fsm.currentState && fsm.currentState.handlePointerMove) {
                fsm.currentState.handlePointerMove(worldCoords, { x: screenX, y: screenY }, fsm.context);
            }
        });
    }
}
