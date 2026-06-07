/** @type {import("../../Core/GameDefinitionTypes.js").UiPort | null} */
let mountedUiPort = null;

/**
 * Tear down the previous game's UI, then mount the next.
 *
 * @param {import("../../Core/GameDefinitionTypes.js").UiPort} uiPort
 * @param {{ state: object, upgrades: object[] }} ctx
 */
export function mountGameUi(uiPort, ctx) {
    mountedUiPort?.unmount?.();
    uiPort.mount(ctx);
    mountedUiPort = uiPort;
}

/** @returns {HTMLElement | null} */
export function getUiRoot() {
    return document.getElementById("ui-root");
}
