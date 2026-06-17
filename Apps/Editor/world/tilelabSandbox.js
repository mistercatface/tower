import { mountSandboxController } from "./mountSandboxController.js";
import { mountSandboxToyUi } from "../ui/sandboxToyUi.js";
import { mountSceneSnapshotPanel } from "../../../Libraries/Persistence/SceneSnapshotPanel.js";
let unmountToyUi = null;
/** @param {import("../state.js").TileLabGameState} state */
export function mountTilelabSandbox(state) {
    destroyTilelabSandbox(state);
    const controller = mountSandboxController(state);
    unmountToyUi = mountSandboxToyUi(document.getElementById("sandboxToyPanel"), state, controller);
    mountSceneSnapshotPanel(document.getElementById("sceneJsonPanel"), controller);
}
/** @param {import("../state.js").TileLabGameState} state */
export function destroyTilelabSandbox(state) {
    unmountToyUi?.();
    unmountToyUi = null;
    document.getElementById("sceneJsonPanel").innerHTML = "";
    state.sandbox.controller?.destroy();
    state.sandbox.controller = null;
}
