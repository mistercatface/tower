import { requestGamePause, requestGameResume } from "../../Core/EventSystem.js";
import { poolRadio } from "./radio.js";
/** @param {import("../../Libraries/Events/EventBus.js").EventBus} eventBus */
export function registerPoolListeners(eventBus) {
    poolRadio.wire(eventBus, { requestPause: requestGamePause, requestResume: requestGameResume });
}
