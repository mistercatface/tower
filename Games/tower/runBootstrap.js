import { createRunBootstrapPort } from "../../Libraries/RunBootstrap/RunBootstrapPipeline.js";
import { generateWorldPhase } from "../../Libraries/RunBootstrap/phases.js";
import {
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
        buildMapRenderCachesPhase,
        placePlayerFromLayoutPhase,
        spawnRunPartyPhase,
        spawnMapPickupsPhase,
    ]);
}
