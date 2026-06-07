/** @type {import("../../Core/GameDefinitionTypes.js").UiPort | null} */
let mountedUiPort = null;
/**
 * Tear down the previous game's UI, then mount the next.
 *
 * @param {import("../../Core/GameDefinitionTypes.js").UiPort} uiPort
 * @param {object} state
 */
export function mountGameUi(uiPort, state) {
    mountedUiPort?.unmount?.();
    uiPort.mount({ state });
    mountedUiPort = uiPort;
}
/** @returns {HTMLElement | null} */
export function getUiRoot() {
    return document.getElementById("ui-root");
}
