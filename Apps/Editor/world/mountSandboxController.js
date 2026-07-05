import { canvasClientToWorld } from "../../../Libraries/Input/canvasPointer.js";
import { createSandboxController } from "../../../Libraries/SandboxEditor/createSandboxController.js";
import { createCueStrikeBehavior } from "../../../Libraries/Props/props.js";
import { createDragLaunchFacingBehavior } from "../../../Libraries/Props/props.js";
import { createFlipperBehavior } from "../../../Libraries/Props/props.js";
import { createDirectGroundNavBehavior } from "../../../Libraries/Navigation/navigation.js";
import { createFlowGroundNavBehavior } from "../../../Libraries/Navigation/navigation.js";
import { createHpaGroundNavBehavior } from "../../../Libraries/Navigation/navigation.js";
import { createSpawnerBehavior } from "../../../Libraries/Props/props.js";
import { createDragLaunchBehavior, createDragLaunchWaitBehavior } from "../../../Libraries/Props/props.js";
function createSandboxBehaviors(state) {
    return [
        createDragLaunchBehavior(state),
        createDragLaunchWaitBehavior(state),
        createDragLaunchFacingBehavior(state),
        createSpawnerBehavior(state),
        createFlipperBehavior(state),
        createCueStrikeBehavior(state),
        createDirectGroundNavBehavior(state),
        createHpaGroundNavBehavior(state),
        createFlowGroundNavBehavior(state),
    ];
}
/** @param {import("../state.js").TileLabGameState} state @param {{ playMode?: boolean }} [options] */
export function mountSandboxController(state, { playMode = false } = {}) {
    if (playMode) state.editor.showSelectionRings = false;
    else
        state.sandbox.simulationFrameHooks = {
            beforePhysics() {
                state.nav.session.beginFrame();
            },
            afterPhysics() {
                state.nav.session.flushFrame();
            },
        };
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
