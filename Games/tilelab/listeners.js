import { FloatingText } from "../../Libraries/Render/FloatingText.js";
/** @param {import("../../Libraries/Events/EventBus.js").EventBus} eventBus */
export function registerTilelabListeners(eventBus) {
    FloatingText.registerEventListener(eventBus);
}
