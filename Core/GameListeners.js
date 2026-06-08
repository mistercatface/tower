import { Events, requestUiUpdate } from "./EventSystem.js";
import { registerPauseListeners } from "./PauseManager.js";
import { adjustSelectedSpeed } from "../Libraries/Playback/index.js";
import { getActiveGameDefinition } from "./ActiveGameDefinition.js";
/** @param {import("../Libraries/Events/EventBus.js").EventBus} eventBus @param {import("./PauseManager.js").PauseManager} pauseManager */
export function registerCoreListeners(eventBus, pauseManager) {
    registerPauseListeners(eventBus, pauseManager);
    eventBus.on(Events.GAME_TOGGLE_PAUSE, () => {
        requestUiUpdate();
    });
    eventBus.on(Events.GAME_SET_SPEED, ({ state, delta }) => {
        adjustSelectedSpeed(state, delta, getActiveGameDefinition());
        requestUiUpdate();
    });
    eventBus.on(Events.GAME_RESTART, ({ resetGame }) => {
        resetGame();
    });
}
