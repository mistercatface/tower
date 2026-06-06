import { createRunBootstrapPort } from "../RunBootstrapPipeline.js";
import {
    applyWeaponLoadoutPhase,
    generateWorldPhase,
    initRunStatePhase,
    placePlayerFromLayoutPhase,
    resetAbilityTimersPhase,
    spawnMapPickupsPhase,
    spawnRunPartyPhase,
    syncUpgradeLevelsPhase,
} from "../phases.js";
/** Tower — full map reset: upgrades, loadout, world gen, party, per-node pickups. */
export function createRoguelikeRunBootstrapPort() {
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
