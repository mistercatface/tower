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
    createRollToCursorFlowBehavior,
    createShootBehavior,
    createSandboxController,
    DRAG_LAUNCH_BEHAVIOR_ID,
} from "../../../Libraries/Sandbox/index.js";
import { createFlipperBehavior } from "../../../Libraries/Sandbox/behaviors/flipperBehavior.js";
import { mountSandboxToyUi, mountSceneJsonUi } from "../ui/sandboxToyUi.js";
let unmountToyUi = null;
let unmountSceneJsonUi = null;
/** @param {import("../state.js").TileLabGameState} state */
export function mountTilelabSandbox(state) {
    destroyTilelabSandbox(state);
    const canvas = () => state.editor.canvas;
    state.sandbox.controller = createSandboxController(state, {
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
            createRollToCursorFlowBehavior(state),
        ],
        defaultBehaviorId: DRAG_LAUNCH_BEHAVIOR_ID,
    });
    const controller = state.sandbox.controller;
    controller.register();
    unmountToyUi = mountSandboxToyUi(document.getElementById("sandboxToyPanel"), controller, () => controller.sync());
    unmountSceneJsonUi = mountSceneJsonUi(document.getElementById("sceneJsonPanel"), controller, () => controller.sync());
}
/** @param {import("../state.js").TileLabGameState} state */
export function destroyTilelabSandbox(state) {
    unmountToyUi?.();
    unmountToyUi = null;
    unmountSceneJsonUi?.();
    unmountSceneJsonUi = null;
    state.sandbox.controller?.destroy();
    state.sandbox.controller = null;
}
