import { createDragLaunchToy, mountSandboxToyUi } from "../../../Libraries/Sandbox/index.js";
import { createTilelabSandboxHost } from "./tilelabSandboxHost.js";
/** @type {ReturnType<typeof createDragLaunchToy> | null} */
let dragLaunchToy = null;
let unmountToyUi = null;
/**
 * @param {import("../TileLabGameState.js").TileLabGameState} state
 * @param {() => void} requestRedraw
 */
export function mountTilelabDragLaunchToy(state, requestRedraw) {
    destroyTilelabDragLaunchToy();
    dragLaunchToy = createDragLaunchToy(createTilelabSandboxHost(state, requestRedraw));
    dragLaunchToy.register();
    const container = document.getElementById("sandboxToyPanel");
    if (container) unmountToyUi = mountSandboxToyUi(container, dragLaunchToy, requestRedraw);
}
export function destroyTilelabDragLaunchToy() {
    unmountToyUi?.();
    unmountToyUi = null;
    dragLaunchToy?.destroy();
    dragLaunchToy = null;
}
export function clearTilelabSandboxBodies(state) {
    state.pickups = [];
    dragLaunchToy?.clearBodies();
}
/** @returns {ReturnType<typeof createDragLaunchToy> | null} */
export function getTilelabDragLaunchToy() {
    return dragLaunchToy;
}
