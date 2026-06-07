import { createTowerUpgradeDefs } from "./Upgrades.js";
import { Events } from "../../../Core/EventSystem.js";
import { hardResetProgress, initializeSaveSystem, loadProgress, registerProgressListeners } from "./Storage.js";
import { StatsManager } from "./StatsManager.js";
/** @param {{ state: object, events: import("../../../Libraries/Events/EventBus.js").EventBus }} ctx */
export function progressionBootstrap({ state, events }) {
    state.upgradeDefs = createTowerUpgradeDefs();
    StatsManager.initUpgradesList(state);
    registerProgressListeners(events);
    loadProgress(state);
    initializeSaveSystem(state);
    events.on(Events.PROGRESS_HARD_RESET, ({ state: s, resetGame: restart }) => {
        hardResetProgress(s, restart);
    });
}
