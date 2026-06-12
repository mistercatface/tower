import { canvasClientToWorld } from "../../../Libraries/Input/canvasPointer.js";
import { TILELAB_SANDBOX_SPAWN_PROP } from "../state.js";
import { worldPropStates } from "../../../Entities/WorldPropStates.js";
import { voidSinkWorldPropStates } from "../../../Entities/worldPropVoidSinkState.js";
import { addWorldPropToState, clearWorldPropsInState, removeWorldPropFromState } from "../../../GameState/EntityRegistry.js";
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
/** @param {import("../state.js").TileLabGameState} state @param {() => void} requestRedraw */
function createSandboxHost(state, requestRedraw) {
    return {
        getCanvas: () => state.editor.canvas,
        clientToWorld(clientX, clientY) {
            return canvasClientToWorld(state.editor.canvas, state.viewport, clientX, clientY);
        },
        getCameraOrigin: () => ({ x: state.viewport.x, y: state.viewport.y }),
        requestRedraw,
        computePath: (startX, startY, targetX, targetY) => state.hierarchicalNavigator.computePath(startX, startY, targetX, targetY),
        forEachWorldProp: (fn) =>
            state.entityRegistry.forEachOfKind("worldProp", (prop) => {
                if (prop.isDead) return;
                fn(prop);
            }),
        addProp: (prop) => addWorldPropToState(state, prop),
        removeProp: (prop) => removeWorldPropFromState(state, prop),
        clearProps: () => clearWorldPropsInState(state),
        getSimState: () => state,
        getSandbox: () => state.sandbox,
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
    Object.assign(worldPropStates, voidSinkWorldPropStates);
    sandboxController = createSandboxController(createSandboxHost(state, requestRedraw), {
        defaultSpawnPropId: TILELAB_SANDBOX_SPAWN_PROP,
        behaviors: [
            createDragLaunchBehavior(),
            createDragLaunchWaitBehavior(),
            createDragLaunchFacingBehavior(),
            createSpawnerBehavior(),
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
    delete worldPropStates.voidSink;
}
