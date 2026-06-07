import { Events, requestUiUpdate } from "./EventSystem.js";
import { registerPauseListeners } from "./PauseManager.js";
import { FloatingText } from "../Render/FloatingText.js";
import { adjustSelectedSpeed } from "../Libraries/Playback/index.js";
import { getActiveGameDefinition } from "./ActiveGameDefinition.js";
/** @param {import("../Libraries/Events/EventBus.js").EventBus} eventBus @param {import("./PauseManager.js").PauseManager} pauseManager */
export function registerCoreListeners(eventBus, pauseManager) {
    FloatingText.registerEventListener(eventBus);
    registerPauseListeners(eventBus, pauseManager);
    eventBus.on(Events.GAME_TOGGLE_PAUSE, () => {
        requestUiUpdate();
    });
    eventBus.on(Events.GAME_SET_SPEED, ({ state, delta }) => {
        adjustSelectedSpeed(state, delta, getActiveGameDefinition());
        requestUiUpdate();
    });
    eventBus.on(Events.GAME_ADJUST_ZOOM, ({ state, viewport, delta }) => {
        if (!viewport) return;
        viewport.setZoom(viewport.zoom + delta, state);
        requestUiUpdate();
    });
    eventBus.on(Events.GAME_SET_ZOOM_ABSOLUTE, ({ state, viewport, zoom }) => {
        if (!viewport) return;
        viewport.setZoom(zoom, state);
        requestUiUpdate();
    });
    eventBus.on(Events.GAME_RESTART, ({ resetGame }) => {
        resetGame();
    });
}
