import { Events } from "../../../Core/EventSystem.js";
import { hardResetProgress, initializeSaveSystem, loadProgress, registerProgressListeners } from "./Storage.js";
import { StatsManager } from "./StatsManager.js";
/** @param {{ state: object, upgrades: object[], events: import("../../../Libraries/Events/EventBus.js").EventBus }} ctx */
export function progressionBootstrap({ state, upgrades, events }) {
    StatsManager.initUpgradesList(state, upgrades);
    registerProgressListeners(events);
    loadProgress(state, upgrades);
    initializeSaveSystem(state);
    events.on(Events.PROGRESS_HARD_RESET, ({ state: s, resetGame: restart }) => {
        hardResetProgress(s, restart);
    });
}
