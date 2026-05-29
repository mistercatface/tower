import { Events, requestProgressDirty, requestUiUpdate } from "./EventSystem.js";
import { ProgressionManager } from "../Progression/ProgressionManager.js";
import { registerProgressListeners } from "../Progression/Storage.js";

export function registerGameListeners(eventBus) {
    registerProgressListeners(eventBus);

    eventBus.on(Events.COMBAT_ENEMY_KILLED, ({ enemy, state, upgrades }) => {
        ProgressionManager.processEnemyKillRewards(enemy, state, upgrades);
        requestProgressDirty();
        requestUiUpdate();
    });

    eventBus.on(Events.COMBAT_WAVE_CLEARED, ({ state, upgrades, viewport }) => {
        ProgressionManager.handleWaveCompletion(state, upgrades, viewport);
    });
}
