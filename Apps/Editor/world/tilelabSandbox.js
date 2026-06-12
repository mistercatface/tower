import { canvasClientToWorld } from "../../../Libraries/Input/canvasPointer.js";
import { TILELAB_SANDBOX_SPAWN_PROP } from "../state.js";
import { worldPropStates } from "../../../Entities/WorldPropStates.js";
import { voidSinkWorldPropStates } from "../../../Entities/worldPropVoidSinkState.js";
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
    mountSandboxToyUi,
} from "../../../Libraries/Sandbox/index.js";
import { createFlipperBehavior } from "../../../Libraries/Sandbox/behaviors/flipperBehavior.js";
/** @type {ReturnType<typeof createSandboxController> | null} */
export let sandboxController = null;
let unmountToyUi = null;
/**
 * @param {import("../state.js").TileLabGameState} state
 * @param {() => void} requestRedraw
 */
export function mountTilelabSandbox(state, requestRedraw) {
    destroyTilelabSandbox();
    Object.assign(worldPropStates, voidSinkWorldPropStates);
    const canvas = () => state.editor.canvas;
    sandboxController = createSandboxController(state, {
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
    sandboxController.register();
    unmountToyUi = mountSandboxToyUi(document.getElementById("sandboxToyPanel"), sandboxController, requestRedraw);
}
export function destroyTilelabSandbox() {
    unmountToyUi?.();
    unmountToyUi = null;
    sandboxController?.destroy();
    sandboxController = null;
    delete worldPropStates.voidSink;
}
