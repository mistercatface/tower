import { canvasClientToWorld } from "../ui/labCanvas.js";
import { TILELAB_SANDBOX_SPAWN_PROP } from "../state.js";
import {
    createCueStrikeBehavior,
    createDragLaunchBehavior,
    createRollToCursorDirectBehavior,
    createRollToCursorHpaBehavior,
    createShootBehavior,
    createSandboxController,
    DRAG_LAUNCH_BEHAVIOR_ID,
    mountSandboxToyUi,
} from "../../../Libraries/Sandbox/index.js";
import { registerSandboxVoidPickupStates, unregisterSandboxVoidPickupStates } from "../sandboxVoidZones.js";
/** @param {import("../state.js").TileLabGameState} state @param {() => void} requestRedraw */
function createSandboxHost(state, requestRedraw) {
    return {
        getCanvas: () => state.labCanvas,
        clientToWorld(clientX, clientY) {
            const canvas = state.labCanvas;
            if (!canvas) return null;
            return canvasClientToWorld(canvas, state.viewport, clientX, clientY);
        },
        getCameraOrigin: () => ({ x: state.viewport.x, y: state.viewport.y }),
        requestRedraw,
        computePath: (startX, startY, targetX, targetY) => state.hierarchicalNavigator?.computePath(startX, startY, targetX, targetY) ?? null,
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
/** @type {ReturnType<typeof createSandboxController> | null} */
let sandboxController = null;
let unmountToyUi = null;
/**
 * @param {import("../state.js").TileLabGameState} state
 * @param {() => void} requestRedraw
 */
export function mountTilelabSandbox(state, requestRedraw) {
    destroyTilelabSandbox();
    registerSandboxVoidPickupStates();
    sandboxController = createSandboxController(createSandboxHost(state, requestRedraw), {
        defaultSpawnPropId: TILELAB_SANDBOX_SPAWN_PROP,
        behaviors: [createDragLaunchBehavior(), createCueStrikeBehavior(), createShootBehavior(), createRollToCursorDirectBehavior(), createRollToCursorHpaBehavior()],
        defaultBehaviorId: DRAG_LAUNCH_BEHAVIOR_ID,
    });
    sandboxController.register();
    const container = document.getElementById("sandboxToyPanel");
    if (container) unmountToyUi = mountSandboxToyUi(container, sandboxController, requestRedraw);
}
export function destroyTilelabSandbox() {
    unmountToyUi?.();
    unmountToyUi = null;
    sandboxController?.destroy();
    sandboxController = null;
    unregisterSandboxVoidPickupStates();
}
export function clearTilelabSandbox() {
    sandboxController?.clearBodies();
}
/** @returns {ReturnType<typeof createSandboxController> | null} */
export function getTilelabSandboxController() {
    return sandboxController;
}
