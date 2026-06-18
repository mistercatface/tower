import { canvasClientToWorld } from "../../../Libraries/Input/canvasPointer.js";
import { createSandboxController } from "../../../Libraries/SandboxEditor/createSandboxController.js";
import { createCueStrikeBehavior } from "../../../Libraries/Sandbox/behaviors/cueStrikeBehavior.js";
import { createDragLaunchFacingBehavior } from "../../../Libraries/Sandbox/behaviors/dragLaunchFacingBehavior.js";
import { createFlipperBehavior } from "../../../Libraries/Sandbox/behaviors/flipperBehavior.js";
import { createRollToCursorDirectBehavior } from "../../../Libraries/Sandbox/behaviors/rollToCursorDirectBehavior.js";
import { createRollToCursorFlowBehavior } from "../../../Libraries/Sandbox/behaviors/rollToCursorFlowBehavior.js";
import { createRollToCursorHpaBehavior } from "../../../Libraries/Sandbox/behaviors/rollToCursorHpaBehavior.js";
import { createSpawnerBehavior } from "../../../Libraries/Sandbox/behaviors/spawnerBehavior.js";
import { createDragLaunchBehavior, createDragLaunchWaitBehavior } from "../../../Libraries/Sandbox/dragLaunch.js";

function createSandboxBehaviors(state) {
    return [
        createDragLaunchBehavior(state),
        createDragLaunchWaitBehavior(state),
        createDragLaunchFacingBehavior(state),
        createSpawnerBehavior(state),
        createFlipperBehavior(state),
        createCueStrikeBehavior(state),
        createRollToCursorDirectBehavior(),
        createRollToCursorHpaBehavior(state),
        createRollToCursorFlowBehavior(state),
    ];
}

/** @param {import("../state.js").TileLabGameState} state @param {{ playMode?: boolean }} [options] */
export function mountSandboxController(state, { playMode = false } = {}) {
    if (playMode) {
        state.editor.showSelectionRings = false;
        state.editor.showPropTileCells = false;
        state.editor.showRoomNodesAlways = false;
    }
    const getCanvas = () => state.editor.canvas;
    state.sandbox.controller = createSandboxController(state, {
        getCanvas,
        clientToWorld(clientX, clientY) {
            return canvasClientToWorld(getCanvas(), state.viewport, clientX, clientY);
        },
        behaviors: createSandboxBehaviors(state),
    });
    const controller = state.sandbox.controller;
    controller.register();
    return controller;
}
