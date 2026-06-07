import { ProgressionManager } from "./progression/ProgressionManager.js";
export const towerCombatPort = {
    onRunOpeningComplete({ state }) {
        ProgressionManager.setupNewRunAbilities(state);
    },
};
