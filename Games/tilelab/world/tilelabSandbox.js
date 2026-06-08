import { createDragLaunchToy, mountDragLaunchFocusUi } from "../../../Libraries/Sandbox/index.js";
import { createTilelabSandboxHost } from "./tilelabSandboxHost.js";
/** @type {ReturnType<typeof createDragLaunchToy> | null} */
let dragLaunchToy = null;
let unmountFocusUi = null;
/**
 * @param {import("../TileLabGameState.js").TileLabGameState} state
 * @param {() => void} requestRedraw
 */
export function mountTilelabDragLaunchToy(state, requestRedraw) {
    destroyTilelabDragLaunchToy();
    dragLaunchToy = createDragLaunchToy(createTilelabSandboxHost(state, requestRedraw));
    dragLaunchToy.register();
    const container = document.getElementById("toyFocusBar");
    if (container)
        unmountFocusUi = mountDragLaunchFocusUi(container, { getFocus: () => dragLaunchToy.getFocusedPropId(), setFocus: (id) => dragLaunchToy.setFocusedPropId(id), onChange: requestRedraw });
}
export function destroyTilelabDragLaunchToy() {
    unmountFocusUi?.();
    unmountFocusUi = null;
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
