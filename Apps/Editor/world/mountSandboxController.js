import { canvasClientToWorld } from "../../../Libraries/Input/canvasPointer.js";
import { createSandboxController, createDefaultSandboxBehaviors } from "../../../Libraries/Sandbox/sandbox.js";
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
        behaviors: createDefaultSandboxBehaviors(state),
    });
    const controller = state.sandbox.controller;
    controller.register();
    return controller;
}
