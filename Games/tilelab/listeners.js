import { Events } from "../../Core/EventSystem.js";

/** @param {import("../../Libraries/Events/EventBus.js").EventBus} eventBus */
export function registerTilelabListeners(eventBus) {
    eventBus.on(Events.UI_HIDE_GAME_OVER, () => {});
    eventBus.on(Events.UI_SHOW_GAME_OVER, () => {});
}
