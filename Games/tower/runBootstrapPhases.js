import { gridSettings } from "../../Config/Config.js";
import { rollPlayerStartLoadout } from "../../Combat/weaponLoadout.js";
import { generateWorld, getWorldGen } from "../../Core/GamePorts.js";
import { spawnInitialPickups, spawnStartGamePickups } from "../../Entities/Pickup.js";
import { StatsManager } from "./progression/StatsManager.js";
/** @typedef {import("../../Libraries/RunBootstrap/RunBootstrapPipeline.js").RunBootstrapContext} RunBootstrapContext */
/** @typedef {import("../../Libraries/RunBootstrap/RunBootstrapPipeline.js").RunBootstrapPhase} RunBootstrapPhase */
/** @type {RunBootstrapPhase} */
export const initRunStatePhase = {
    run(ctx) {
        ctx.state.initializeDefaultState();
    },
};
/** @type {RunBootstrapPhase} */
export const resetAbilityTimersPhase = {
    run(ctx) {
        const { state, upgrades } = ctx;
        if (!upgrades?.length) return;
        for (const upg of upgrades) if (upg.isAbility) state.abilityTimers[upg.id] = { readyTime: 0, activeUntil: 0, activeId: null, cooldownId: null };
    },
};
/** @type {RunBootstrapPhase} */
export const syncUpgradeLevelsPhase = {
    run(ctx) {
        const { state, upgrades } = ctx;
        if (!upgrades?.length) return;
        const player = state.player;
        StatsManager.recalculateStats(state, upgrades);
        for (const key in player.upgrades) {
            const upgDef = upgrades.find((u) => u.id === key);
            if (upgDef) {
                if (upgDef.isAbility)
                    if (player.startingAbilities?.includes(key)) player.upgrades[key].baseLevel = 1;
                    else player.upgrades[key].baseLevel = 0;
                player.upgrades[key].baseLevel = Math.min(player.upgrades[key].baseLevel, upgDef.maxLevel);
            }
            player.upgrades[key].level = player.upgrades[key].baseLevel;
            player.upgrades[key].ptsCost = state.runStats.baseUpgradeCost.value;
        }
        if (player.startingAbilities) for (const abilityId of player.startingAbilities) state.abilities[abilityId] = true;
        for (const upg of upgrades) if (upg.onRunStart && player.upgrades[upg.id]?.baseLevel > 0) upg.onRunStart(state);
        StatsManager.recalculateStats(state, upgrades);
    },
};
/** @type {RunBootstrapPhase} */
export const applyWeaponLoadoutPhase = {
    run(ctx) {
        const { state, upgrades } = ctx;
        state.player.applyWeaponLoadout(rollPlayerStartLoadout(), { state, upgradeDefs: upgrades });
    },
};
/** @type {RunBootstrapPhase} */
export const placePlayerFromLayoutPhase = {
    run(ctx) {
        const { state } = ctx;
        const worldGen = getWorldGen();
        const startNode = state.getMapNode(worldGen.startMapNodeId ?? 0);
        if (!startNode) return;
        const coords = state.getNodeWorldCoords(startNode);
        const layout = worldGen.getStartLayout(coords.x, coords.y, gridSettings.cellSize);
        state.player.setSpawnPosition(layout.spawnX, layout.spawnY);
        state.player.resetToSpawn();
    },
};
/** @type {RunBootstrapPhase} */
export const spawnRunPartyPhase = {
    run(ctx) {
        ctx.state.spawnRunParty();
    },
};
/** @type {RunBootstrapPhase} */
export const spawnMapPickupsPhase = {
    run(ctx) {
        const { state } = ctx;
        const worldGen = getWorldGen();
        if (worldGen.skipStartPickups) return;
        const startId = worldGen.startMapNodeId ?? 0;
        for (const node of state.mapNodes) {
            const coords = state.getNodeWorldCoords(node);
            if (node.id === startId) spawnStartGamePickups(state, coords.x, coords.y);
            else spawnInitialPickups(state, coords.x, coords.y);
        }
    },
};
