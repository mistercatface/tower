import { canvasClientToWorld } from "../../../Libraries/Input/canvasPointer.js";
import { TILELAB_SANDBOX_SPAWN_PROP } from "../state.js";
import { pickupStates } from "../../../Entities/PickupStates.js";
import { voidSinkPickupStates } from "../../../Entities/pickupVoidSinkState.js";
import {
    createCueStrikeBehavior,
    createDragLaunchBehavior,
    createDragLaunchWaitBehavior,
    createRollToCursorDirectBehavior,
    createRollToCursorHpaBehavior,
    createShootBehavior,
    createSandboxController,
    DRAG_LAUNCH_BEHAVIOR_ID,
    mountSandboxToyUi,
} from "../../../Libraries/Sandbox/index.js";
import { createFlipperBehavior } from "../../../Libraries/Sandbox/behaviors/flipperBehavior.js";
/** @param {import("../state.js").TileLabGameState} state @param {() => void} requestRedraw */
function createSandboxHost(state, requestRedraw) {
    return {
        getCanvas: () => state.labCanvas,
        clientToWorld(clientX, clientY) {
            return canvasClientToWorld(state.labCanvas, state.viewport, clientX, clientY);
        },
        getCameraOrigin: () => ({ x: state.viewport.x, y: state.viewport.y }),
        requestRedraw,
        computePath: (startX, startY, targetX, targetY) => state.hierarchicalNavigator.computePath(startX, startY, targetX, targetY),
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
export let sandboxController = null;
let unmountToyUi = null;
/**
 * @param {import("../state.js").TileLabGameState} state
 * @param {() => void} requestRedraw
 */
export function mountTilelabSandbox(state, requestRedraw) {
    destroyTilelabSandbox();
    Object.assign(pickupStates, voidSinkPickupStates);
    sandboxController = createSandboxController(createSandboxHost(state, requestRedraw), {
        defaultSpawnPropId: TILELAB_SANDBOX_SPAWN_PROP,
        behaviors: [
            createDragLaunchBehavior(),
            createDragLaunchWaitBehavior(),
            createFlipperBehavior(),
            createCueStrikeBehavior(),
            createShootBehavior(),
            createRollToCursorDirectBehavior(),
            createRollToCursorHpaBehavior(),
        ],
        defaultBehaviorId: DRAG_LAUNCH_BEHAVIOR_ID,
    });
    sandboxController.register();
    unmountToyUi = mountSandboxToyUi(document.getElementById("sandboxToyPanel"), sandboxController, requestRedraw);
}
export function destroyTilelabSandbox() {
    unmountToyUi?.();
    unmountToyUi = null;
    sandboxController?.destroy();
    sandboxController = null;
    delete pickupStates.voidSink;
}
