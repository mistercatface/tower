import { Events } from "./EventNames.js";
export { PauseManager } from "../Libraries/Pause/index.js";
/** @param {import("../Libraries/Events/EventBus.js").EventBus} eventBus */
export function registerPauseListeners(eventBus, pauseManager) {
    eventBus.on(Events.GAME_PAUSE, ({ reason }) => pauseManager.pause(reason));
    eventBus.on(Events.GAME_RESUME, ({ reason }) => pauseManager.resume(reason));
    eventBus.on(Events.GAME_TOGGLE_PAUSE, () => pauseManager.toggleUser());
}
