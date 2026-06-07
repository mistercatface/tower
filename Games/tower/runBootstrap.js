import { createRunBootstrapPort } from "../../Libraries/RunBootstrap/RunBootstrapPipeline.js";
import { generateWorldPhase } from "../../Libraries/RunBootstrap/phases.js";
import {
    applyWeaponLoadoutPhase,
    initRunStatePhase,
    placePlayerFromLayoutPhase,
    resetAbilityTimersPhase,
    spawnMapPickupsPhase,
    spawnRunPartyPhase,
    syncUpgradeLevelsPhase,
} from "./runBootstrapPhases.js";
export function createTowerRunBootstrapPort() {
    return createRunBootstrapPort([
        initRunStatePhase,
        resetAbilityTimersPhase,
        syncUpgradeLevelsPhase,
        applyWeaponLoadoutPhase,
        generateWorldPhase,
        placePlayerFromLayoutPhase,
        spawnRunPartyPhase,
        spawnMapPickupsPhase,
    ]);
}
