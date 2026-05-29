import { Turret } from "../Entities/Turret.js";
import { perkMilestones } from "../Config/Config.js";
import { createUpgradeLevels, resetUpgradeLevels } from "../Entities/CombatantStats.js";
import { spawnFloatingText } from "../Core/EventSystem.js";
import { MapGenerator } from "../Generator/MapGenerator.js";

export class StatsManager {
    static initUpgradesList(state, upgradeList) {
        state.upgradeDefs = upgradeList;
        const player = state.player;
        if (Object.keys(player.upgrades).length === 0) {
            player.upgrades = createUpgradeLevels(upgradeList, player.stats.baseUpgradeCost.value);
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
        let xpNeeded = Math.floor(25 * Math.pow(1.5, state.level));
        while (state.xp >= xpNeeded) {
            state.xp -= xpNeeded;
            state.level++;
            if (perkMilestones.includes(state.level) && !state.claimedPerkMilestones.includes(state.level)) {
                state.pendingPerkPicks.push(state.level);
                state.claimedPerkMilestones.push(state.level);
            }
            state.pendingLevelUps++;
            if (state.level > state.highestLevelReached) state.highestLevelReached = state.level;
            xpNeeded = Math.floor(25 * Math.pow(1.5, state.level));
            spawnFloatingText({ x: state.player.x, y: state.player.y - 40, text: "LEVEL UP", color: "#FFEB3B" });
        }
    }

    static recalculateStats(state, upgradesList) {
        const player = state.player;
        const stats = player.stats;

        player.recalculateCombatStats(upgradesList ?? state.upgradeDefs, (upg) => {
            if (upg.isAbility && !state.abilities[upg.id]) return false;
            return true;
        });

        state.gameSpeed = stats.gameSpeed.value;
        state.selectedSpeed = Math.min(state.selectedSpeed, state.gameSpeed);
        state.pointBonus = stats.pointBonus.value;

        const targetTurretCount = Math.floor(stats.turretCount.value);
        while (state.turrets.length < targetTurretCount) {
            const newAngle = (state.turrets.length / targetTurretCount) * Math.PI * 2;
            state.turrets.push(new Turret(newAngle, stats.turnSpeed.value));
        }
        while (state.turrets.length > targetTurretCount) {
            state.turrets.pop();
        }
        state.turrets.forEach(t => t.turnSpeed = stats.turnSpeed.value);

        if (upgradesList) {
            upgradesList.forEach((upg) => {
                if (upg.isAbility && state.abilities && state.abilities[upg.id] && upg.abilityApplyFn) {
                    upg.abilityApplyFn(state.player.weapon, state.player);
                }
            });
        }
    }

    static resetRun(state, upgradesList) {
        state.initializeDefaultState();
        state.mapTargetNodeId = 0;

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
            player.upgrades[key].ptsCost = player.stats.baseUpgradeCost.value;
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
        MapGenerator.generateMap(state);

        const startNode = state.getMapNode(0);
        if (startNode) {
            const coords = state.getNodeCombatCoords(startNode);
            state.player.setSpawnPosition(coords.x, coords.y);
            state.player.resetToSpawn();
        }
    }
}
