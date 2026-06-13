import { canvasClientToWorld } from "../../../Libraries/Input/canvasPointer.js";
import { TILELAB_SANDBOX_SPAWN_PROP } from "../state.js";
import {
    createCueStrikeBehavior,
    createDragLaunchBehavior,
    createDragLaunchFacingBehavior,
    createDragLaunchWaitBehavior,
    createSpawnerBehavior,
    createRollToCursorDirectBehavior,
    createRollToCursorHpaBehavior,
    createShootBehavior,
    createSandboxController,
    DRAG_LAUNCH_BEHAVIOR_ID,
} from "../../../Libraries/Sandbox/index.js";
import { createFlipperBehavior } from "../../../Libraries/Sandbox/behaviors/flipperBehavior.js";
import { mountSandboxToyUi } from "../ui/sandboxToyUi.js";
let unmountToyUi = null;
/**
 * @param {import("../state.js").TileLabGameState} state
 * @param {() => void} requestRedraw
 */
export function mountTilelabSandbox(state, requestRedraw) {
    destroyTilelabSandbox(state);
    const canvas = () => state.editor.canvas;
    state.sandbox.controller = createSandboxController(state, {
        requestRedraw,
        getCanvas: canvas,
        clientToWorld(clientX, clientY) {
            return canvasClientToWorld(canvas(), state.viewport, clientX, clientY);
        },
        defaultSpawnPropId: TILELAB_SANDBOX_SPAWN_PROP,
        behaviors: [
            createDragLaunchBehavior(state),
            createDragLaunchWaitBehavior(state),
            createDragLaunchFacingBehavior(state),
            createSpawnerBehavior(state),
            createFlipperBehavior(state),
            createCueStrikeBehavior(state),
            createShootBehavior(state),
            createRollToCursorDirectBehavior(),
            createRollToCursorHpaBehavior(state),
        ],
        defaultBehaviorId: DRAG_LAUNCH_BEHAVIOR_ID,
    });
    state.sandbox.controller.register();
    unmountToyUi = mountSandboxToyUi(document.getElementById("sandboxToyPanel"), state.sandbox.controller, requestRedraw);
}
/** @param {import("../state.js").TileLabGameState} state */
export function destroyTilelabSandbox(state) {
    unmountToyUi?.();
    unmountToyUi = null;
    state.sandbox.controller?.destroy();
    state.sandbox.controller = null;
}
