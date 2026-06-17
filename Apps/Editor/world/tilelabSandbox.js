import { mountSandboxController } from "./mountSandboxController.js";
import { mountSandboxToyUi, mountSceneJsonUi } from "../ui/sandboxToyUi.js";
let unmountToyUi = null;
let unmountSceneJsonUi = null;
/** @param {import("../state.js").TileLabGameState} state */
export function mountTilelabSandbox(state) {
    destroyTilelabSandbox(state);
    const controller = mountSandboxController(state);
    unmountToyUi = mountSandboxToyUi(document.getElementById("sandboxToyPanel"), controller);
    unmountSceneJsonUi = mountSceneJsonUi(document.getElementById("sceneJsonPanel"), controller);
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
