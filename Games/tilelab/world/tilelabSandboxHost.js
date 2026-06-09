import { canvasClientToWorld } from "../ui/labCanvas.js";
/** @typedef {import("../../../Libraries/Sandbox/SandboxHostPort.js").SandboxHostPort} SandboxHostPort */
/**
 * @param {import("../index.js").TileLabGameState} state
 * @param {() => void} requestRedraw
 * @returns {SandboxHostPort}
 */
export function createTilelabSandboxHost(state, requestRedraw) {
    return {
        getCanvas: () => state.labCanvas,
        clientToWorld(clientX, clientY) {
            const canvas = state.labCanvas;
            if (!canvas) return null;
            return canvasClientToWorld(canvas, state.mapViewport, clientX, clientY);
        },
        getCameraOrigin: () => ({ x: state.mapViewport.x, y: state.mapViewport.y }),
        requestRedraw,
        computePath: (startX, startY, targetX, targetY) => {
            return state.hierarchicalNavigator?.computePath(startX, startY, targetX, targetY) ?? null;
        },
        getPickups: () => state.pickups,
        addPickup: (prop) => state.pickups.push(prop),
        removePickup: (prop) => {
            const index = state.pickups.indexOf(prop);
            if (index >= 0) state.pickups.splice(index, 1);
        },
        clearPickups: () => {
            state.pickups = [];
        },
        getWorldState: () => state,
    };
}
