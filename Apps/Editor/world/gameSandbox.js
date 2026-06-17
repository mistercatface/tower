import { canvasClientToWorld } from "../../../Libraries/Input/canvasPointer.js";
import { createSandboxController } from "../../../Libraries/SandboxEditor/createSandboxController.js";
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
    DRAG_LAUNCH_BEHAVIOR_ID,
} from "../../../Libraries/Sandbox/index.js";
import { createFlipperBehavior } from "../../../Libraries/Sandbox/behaviors/flipperBehavior.js";
/** @param {import("../state.js").TileLabGameState} state */
export function mountGameSandbox(state) {
    destroyGameSandbox(state);
    const canvas = () => state.editor.canvas;
    state.sandbox.controller = createSandboxController(state, {
        getCanvas: canvas,
        clientToWorld(clientX, clientY) {
            return canvasClientToWorld(canvas(), state.viewport, clientX, clientY);
        },
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
    controller.setShowSelectionRings(false);
    controller.setShowPropTileCells(false);
    controller.setShowRoomNodesAlways(false);
}
/** @param {import("../state.js").TileLabGameState} state */
export function destroyGameSandbox(state) {
    state.sandbox.controller?.destroy();
    state.sandbox.controller = null;
}
