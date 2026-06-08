import { canvasClientToWorld } from "../ui/labCanvas.js";
/** @typedef {import("../../../Libraries/Sandbox/SandboxHostPort.js").SandboxHostPort} SandboxHostPort */
/** Default until a focus selector UI is wired — must match a prop with `spawn.dragLaunch`. */
const DEFAULT_FOCUS_PROP_ID = "beach_ball";
/**
 * @param {import("../TileLabGameState.js").TileLabGameState} state
 * @param {() => void} requestRedraw
 * @returns {SandboxHostPort}
 */
export function createTilelabSandboxHost(state, requestRedraw) {
    return {
        getCanvas: () => document.getElementById("gameCanvas"),
        clientToWorld(clientX, clientY) {
            const canvas = document.getElementById("gameCanvas");
            if (!canvas) return null;
            state.mapViewport.setCanvasSize(canvas.width, canvas.height);
            return canvasClientToWorld(canvas, state.mapViewport, clientX, clientY);
        },
        isInputBlocked: () => state.labShowTopologyOverlay,
        requestRedraw,
        getFocusedPropId: () => DEFAULT_FOCUS_PROP_ID,
        getPickups: () => state.pickups,
        addPickup: (prop) => state.pickups.push(prop),
        clearPickups: () => {
            state.pickups = [];
        },
    };
}
