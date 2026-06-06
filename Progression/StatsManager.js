import { gridSettings, perkMilestones, xpForLevel } from "../Config/Config.js";
import { createUpgradeLevels, resetUpgradeLevels } from "../Entities/CombatantStats.js";
import { spawnFloatingText } from "../Core/EventSystem.js";
import { MapGenerator } from "../Generator/MapGenerator.js";
import { getWorldGen } from "../Core/GamePorts.js";
import { rollPlayerStartLoadout } from "../Combat/weaponLoadout.js";
import { spawnInitialPickups, spawnStartGamePickups } from "../Entities/Pickup.js";

export class StatsManager {
    static initUpgradesList(state, upgradeList) {
        state.upgradeDefs = upgradeList;
        const player = state.player;
        if (Object.keys(player.upgrades).length === 0) {
            player.upgrades = createUpgradeLevels(upgradeList, state.runStats.baseUpgradeCost.value);
            StatsManager.resetUpgradesToDefault(state);
        }
        for (const upg of upgradeList) {
            if (upg.isAbility && !state.abilityTimers[upg.id]) {
                state.abilityTimers[upg.id] = { readyTime: 0, activeUntil: 0, activeId: null, cooldownId: null };
            }
        }
    }

    static resetUpgradesToDefault(state) {
        resetUpgradeLevels(state.player.upgrades);
    }

    static grantXP(state, amount) {
        state.xp += amount;
        let xpNeeded = xpForLevel(state.level);
        while (state.xp >= xpNeeded) {
            state.xp -= xpNeeded;
            state.level++;
            if (perkMilestones.includes(state.level) && !state.claimedPerkMilestones.includes(state.level)) {
                state.pendingPerkPicks.push(state.level);
                state.claimedPerkMilestones.push(state.level);
            }
            state.pendingLevelUps++;
            if (state.level > state.highestLevelReached) state.highestLevelReached = state.level;
            xpNeeded = xpForLevel(state.level);
            spawnFloatingText({ x: state.player.x, y: state.player.y - 40, text: "LEVEL UP", color: "#FFEB3B" });
        }
    }

    static recalculateStats(state, upgradesList) {
        const upgradeDefs = upgradesList ?? state.upgradeDefs;
        state.player.recalculate(state, upgradeDefs, (upg) => {
            if (upg.isAbility && !state.abilities[upg.id]) return false;
            return true;
        });
    }

    static resetRun(state, upgradesList) {
        state.initializeDefaultState();

        const player = state.player;

        if (upgradesList) {
            upgradesList.forEach((upg) => {
                if (upg.isAbility) {
                    state.abilityTimers[upg.id] = { readyTime: 0, activeUntil: 0, activeId: null, cooldownId: null };
                }
            });
        }

        StatsManager.recalculateStats(state, upgradesList);
        for (const key in player.upgrades) {
            if (upgradesList) {
                const upgDef = upgradesList.find((u) => u.id === key);
                if (upgDef) {
                    if (upgDef.isAbility) {
                        if (player.startingAbilities && player.startingAbilities.includes(key)) {
                            player.upgrades[key].baseLevel = 1;
                        } else {
                            player.upgrades[key].baseLevel = 0;
                        }
                    }
                    player.upgrades[key].baseLevel = Math.min(player.upgrades[key].baseLevel, upgDef.maxLevel);
                }
            }
            player.upgrades[key].level = player.upgrades[key].baseLevel;
            player.upgrades[key].ptsCost = state.runStats.baseUpgradeCost.value;
        }

        if (player.startingAbilities) {
            player.startingAbilities.forEach((abilityId) => {
                state.abilities[abilityId] = true;
            });
        }

        if (upgradesList) {
            upgradesList.forEach((upg) => {
                if (upg.onRunStart && player.upgrades[upg.id] && player.upgrades[upg.id].baseLevel > 0) upg.onRunStart(state);
            });
        }

        StatsManager.recalculateStats(state, upgradesList);
        player.applyWeaponLoadout(rollPlayerStartLoadout(), { state, upgradeDefs: upgradesList });
        MapGenerator.generateMap(state);

        const worldGen = getWorldGen();
        const startNode = state.getMapNode(worldGen.startMapNodeId ?? 0);
        if (startNode) {
            const coords = state.getNodeCombatCoords(startNode);
            const layout = worldGen.getStartLayout(coords.x, coords.y, gridSettings.cellSize);
            state.player.setSpawnPosition(layout.spawnX, layout.spawnY);
            state.player.resetToSpawn();

            state.spawnRunParty();
        }

        if (!worldGen.skipStartPickups) {
            for (const node of state.mapNodes) {
                const coords = state.getNodeCombatCoords(node);
                if (node.id === (worldGen.startMapNodeId ?? 0)) {
                    spawnStartGamePickups(state, coords.x, coords.y);
                } else {
                    spawnInitialPickups(state, coords.x, coords.y);
                }
            }
        }
    }
}
