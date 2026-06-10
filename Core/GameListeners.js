import { Events, requestUiUpdate } from "./EventSystem.js";
import { registerPauseListeners } from "./PauseManager.js";
import { adjustSelectedSpeed } from "../Libraries/Playback/index.js";
/** @typedef {import("./GameDefinitionTypes.js").EngineProfile} EngineProfile */
/** @param {import("../Libraries/Events/EventBus.js").EventBus} eventBus @param {import("./PauseManager.js").PauseManager} pauseManager @param {EngineProfile} profile */
export function registerCoreListeners(eventBus, pauseManager, profile) {
    registerPauseListeners(eventBus, pauseManager);
    eventBus.on(Events.GAME_TOGGLE_PAUSE, () => {
        requestUiUpdate();
    });
    eventBus.on(Events.GAME_SET_SPEED, ({ state, delta }) => {
        adjustSelectedSpeed(state, delta, profile);
        requestUiUpdate();
    });
}
