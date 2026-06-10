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
import { createTilelabSandboxHost } from "./tilelabSandboxHost.js";
import { registerSandboxVoidPickupStates, unregisterSandboxVoidPickupStates } from "../sandboxVoidZones.js";
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
    sandboxController = createSandboxController(createTilelabSandboxHost(state, requestRedraw), {
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
