import { createDragLaunchToy } from "../../../Libraries/Sandbox/index.js";
import { createTilelabSandboxHost } from "./tilelabSandboxHost.js";
/** @type {ReturnType<typeof createDragLaunchToy> | null} */
let dragLaunchToy = null;
/**
 * @param {import("../TileLabGameState.js").TileLabGameState} state
 * @param {() => void} requestRedraw
 */
export function mountTilelabDragLaunchToy(state, requestRedraw) {
    destroyTilelabDragLaunchToy();
    dragLaunchToy = createDragLaunchToy(createTilelabSandboxHost(state, requestRedraw));
    dragLaunchToy.register();
}
export function destroyTilelabDragLaunchToy() {
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
