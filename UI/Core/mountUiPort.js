import { Events } from "../../Core/EventSystem.js";
import { getUiPort } from "../../Core/GamePorts.js";
import { applyChromeVisibility } from "../../Core/GameShell.js";
import { registerSharedOverlayListeners } from "./sharedOverlays.js";

/** @typedef {import("../../Core/GameDefinitionTypes.js").UiContext} UiContext */

/**
 * Bootstrap the active game's UI port and engine-owned overlays.
 *
 * @param {UiContext} ctx
 */
export function mountUiPort(ctx) {
    applyChromeVisibility();
    getUiPort().mount(ctx);
}

/** @param {import("../../Libraries/Events/EventBus.js").EventBus} eventBus */
export function registerUiEventListeners(eventBus) {
    eventBus.on(Events.UI_UPDATE, (data) => {
        getUiPort().updateUI({ state: data.state, upgrades: data.upgrades });
    });
    eventBus.on(Events.UI_UPDATE_HUD, (data) => {
        getUiPort().updateHud({ state: data.state, upgrades: data.upgrades });
    });
    registerSharedOverlayListeners(eventBus);
}
