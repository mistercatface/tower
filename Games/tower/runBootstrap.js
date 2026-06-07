import { createRunBootstrapPort } from "../../Libraries/RunBootstrap/RunBootstrapPipeline.js";
import { generateWorldPhase } from "../../Libraries/RunBootstrap/phases.js";
import {
    applyTowerStartBuildingPhase,
    applyWeaponLoadoutPhase,
    buildMapRenderCachesPhase,
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
        applyTowerStartBuildingPhase,
        buildMapRenderCachesPhase,
        placePlayerFromLayoutPhase,
        spawnRunPartyPhase,
        spawnMapPickupsPhase,
    ]);
}
