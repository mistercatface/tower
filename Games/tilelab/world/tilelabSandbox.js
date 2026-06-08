import { TILELAB_SANDBOX_SPAWN_PROP } from "../config.js";
import {
    createDragLaunchBehavior,
    createRollToCursorDirectBehavior,
    createRollToCursorHpaBehavior,
    createSandboxController,
    DRAG_LAUNCH_BEHAVIOR_ID,
    ROLL_TO_CURSOR_DIRECT_BEHAVIOR_ID,
    ROLL_TO_CURSOR_HPA_BEHAVIOR_ID,
    mountSandboxToyUi,
} from "../../../Libraries/Sandbox/index.js";
import { createTilelabSandboxHost } from "./tilelabSandboxHost.js";
/** @type {ReturnType<typeof createSandboxController> | null} */
let sandboxController = null;
let unmountToyUi = null;
/**
 * @param {import("../TileLabGameState.js").TileLabGameState} state
 * @param {() => void} requestRedraw
 */
export function mountTilelabSandbox(state, requestRedraw) {
    destroyTilelabSandbox();
    sandboxController = createSandboxController(createTilelabSandboxHost(state, requestRedraw), {
        defaultSpawnPropId: TILELAB_SANDBOX_SPAWN_PROP,
        behaviors: [createDragLaunchBehavior(), createRollToCursorDirectBehavior(), createRollToCursorHpaBehavior()],
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
}
export function clearTilelabSandbox() {
    sandboxController?.clearBodies();
}
/** @returns {ReturnType<typeof createSandboxController> | null} */
export function getTilelabSandboxController() {
    return sandboxController;
}
