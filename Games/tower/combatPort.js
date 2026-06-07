import { ProgressionManager } from "./progression/ProgressionManager.js";
import { unlockProximityFightDialog } from "./runScene/behaviors/proximityRadioFight.js";
/** @typedef {import("../../Core/GameDefinitionTypes.js").CombatPort} CombatPort */
/** @type {CombatPort} */
export const towerCombatPort = {
    onRunOpeningComplete({ state, upgrades }) {
        ProgressionManager.setupNewRunAbilities(state, upgrades);
        unlockProximityFightDialog(state);
    },
};
