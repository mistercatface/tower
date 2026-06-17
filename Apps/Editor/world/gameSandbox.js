import { mountSandboxController } from "./mountSandboxController.js";
/** @param {import("../state.js").TileLabGameState} state */
export function mountGameSandbox(state) {
    destroyGameSandbox(state);
    mountSandboxController(state, { playMode: true });
}
/** @param {import("../state.js").TileLabGameState} state */
export function destroyGameSandbox(state) {
    state.sandbox.controller?.destroy();
    state.sandbox.controller = null;
    state.sandbox.session = null;
}
