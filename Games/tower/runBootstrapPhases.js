import { gridSettings } from "../../Config/Config.js";
import { resolveSurfaceProfileId } from "../../Config/procedural/profiles.js";
import { rollPlayerStartLoadout } from "./combat/weaponLoadout.js";
import { getWorldGen } from "../../Core/GamePorts.js";
import { spawnInitialPickups, spawnStartGamePickups } from "../../Entities/Pickup.js";
import { finalizeGeneratedWorld } from "../../Libraries/WorldGen/finalizeGeneratedWorld.js";
import { ROGUELIKE_MAP_TOPOLOGY } from "../../Libraries/WorldGen/presets/roguelikeMap.js";
import { serializeWalls } from "../../Libraries/WorldGen/worldGenUtils.js";
import { buildMapRenderCaches } from "./render/map/MapRenderCache.js";
import { StatsManager } from "./progression/StatsManager.js";
import { generateStartGameBuilding, getStartGameLayout } from "./tutorial/StartGameBuilding.js";
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
        const { state } = ctx;
        const upgradeDefs = state.upgradeDefs ?? [];
        if (!upgradeDefs.length) return;
        for (const upg of upgradeDefs) if (upg.isAbility) state.abilityTimers[upg.id] = { readyTime: 0, activeUntil: 0, activeId: null, cooldownId: null };
    },
};
/** @type {RunBootstrapPhase} */
export const syncUpgradeLevelsPhase = {
    run(ctx) {
        const { state } = ctx;
        const upgradeDefs = state.upgradeDefs ?? [];
        if (!upgradeDefs.length) return;
        const player = state.player;
        StatsManager.recalculateStats(state);
        for (const key in player.upgrades) {
            const upgDef = upgradeDefs.find((u) => u.id === key);
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
        for (const upg of upgradeDefs) if (upg.onRunStart && player.upgrades[upg.id]?.baseLevel > 0) upg.onRunStart(state);
        StatsManager.recalculateStats(state);
    },
};
/** @type {RunBootstrapPhase} */
export const applyWeaponLoadoutPhase = {
    run(ctx) {
        const { state } = ctx;
        state.player.applyWeaponLoadout(rollPlayerStartLoadout(), { state, upgradeDefs: state.upgradeDefs });
    },
};
/** @type {RunBootstrapPhase} */
export const applyTowerStartBuildingPhase = {
    run(ctx) {
        const { state } = ctx;
        const startNode = state.getStartMapNode();
        if (!startNode) return;
        const coords = state.getNodeWorldCoords(startNode);
        const radius = ROGUELIKE_MAP_TOPOLOGY.nodeRoomSerializeRadius;
        state.walls = state.walls.filter((wall) => Math.hypot(wall.x - coords.x, wall.y - coords.y) > radius + wall.size / 2);
        state.wallSpatialIndex.clear();
        for (const wall of state.walls) state.wallSpatialIndex.insert(wall);
        const newWalls = [];
        generateStartGameBuilding({ walls: newWalls, flowFieldGrid: state.flowFieldGrid }, coords.x, coords.y);
        for (const wall of newWalls) {
            state.walls.push(wall);
            state.wallSpatialIndex.insert(wall);
        }
        startNode.wallsData = serializeWalls(newWalls, coords.x, coords.y, radius);
        startNode.strategy = "StartGameBuilding";
        startNode.surfaceProfileId = resolveSurfaceProfileId({ layer: 0, strategy: "StartGameBuildingStrategy" });
        finalizeGeneratedWorld(state, { centerX: coords.x, centerY: coords.y });
    },
};
/** @type {RunBootstrapPhase} */
export const placePlayerFromLayoutPhase = {
    run(ctx) {
        const { state } = ctx;
        const startNode = state.getStartMapNode();
        if (!startNode) return;
        const coords = state.getNodeWorldCoords(startNode);
        const layout = getStartGameLayout(coords.x, coords.y, gridSettings.cellSize);
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
export const buildMapRenderCachesPhase = {
    run(ctx) {
        buildMapRenderCaches(ctx.state);
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
            if (node.id === startId) spawnStartGamePickups(state, coords.x, coords.y, getStartGameLayout(coords.x, coords.y, gridSettings.cellSize));
            else spawnInitialPickups(state, coords.x, coords.y);
        }
    },
};
