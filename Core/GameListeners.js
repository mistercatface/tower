import { Events, requestProgressDirty, requestUiUpdate } from "./EventSystem.js";
import { ProgressionManager } from "../Progression/ProgressionManager.js";
import { registerProgressListeners } from "../Progression/Storage.js";
import { registerPauseListeners } from "./PauseManager.js";

export function registerGameListeners(eventBus, pauseManager) {
    registerProgressListeners(eventBus);
    registerPauseListeners(eventBus, pauseManager);

    eventBus.on(Events.COMBAT_ENEMY_KILLED, ({ enemy, state, upgrades }) => {
        ProgressionManager.processEnemyKillRewards(enemy, state, upgrades);
        requestProgressDirty();
        requestUiUpdate();
    });

    eventBus.on(Events.COMBAT_WAVE_CLEARED, ({ state, upgrades, viewport }) => {
        ProgressionManager.handleWaveCompletion(state, upgrades, viewport);
    });

    eventBus.on(Events.GAME_TOGGLE_PAUSE, () => {
        requestUiUpdate();
    });
}
