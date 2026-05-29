import { Turret } from "../Entities/Turret.js";
import { defaultUpgradeCost, perkMilestones, playerBaseStats } from "../Config/Config.js";
import { spawnFloatingText } from "../Core/EventSystem.js";
import { MapGenerator } from "../Generator/MapGenerator.js";
import { saveProgress } from "./Storage.js";

export class StatsManager {
    static initUpgradesList(state, upgradeList) {
        state.upgradeDefs = upgradeList;
        if (Object.keys(state.upgrades).length === 0) {
            for (const upg of upgradeList) {
                state.upgrades[upg.id] = { level: 0, baseLevel: 0, ptsCost: defaultUpgradeCost };
            }
            StatsManager.resetUpgradesToDefault(state);
        }
        for (const upg of upgradeList) {
            if (upg.isAbility && !state.abilityTimers[upg.id]) {
                state.abilityTimers[upg.id] = { readyTime: 0, activeUntil: 0, activeId: null, cooldownId: null };
            }
        }
    }

    static resetUpgradesToDefault(state) {
        for (const key in state.upgrades) {
            state.upgrades[key].baseLevel = 0;
            state.upgrades[key].level = 0;
        }
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
        for (const key in state.stats) {
            state.stats[key].reset();
        }
        if (upgradesList) {
            upgradesList.forEach((upg) => {
                const level = state.upgrades[upg.id] ? state.upgrades[upg.id].level : 0;
                if (level > 0 && upg.applyFn) {
                    if (upg.isAbility && !state.abilities[upg.id]) return;
                    upg.applyFn(state.stats, level);
                }
            });
        }

        state.player.weapon.accuracyModifier = 0;
        state.player.weapon.damage = state.stats.damage.value;
        state.player.weapon.range = state.stats.range.value;
        state.player.weapon.chargeTime = state.stats.chargeTime.value;
        state.player.weapon.penetration = state.stats.penetration.value;

        state.gameSpeed = state.stats.gameSpeed.value;
        state.selectedSpeed = Math.min(state.selectedSpeed, state.gameSpeed);
        state.pointBonus = state.stats.pointBonus.value;
        state.player.updateMaxHealth(state.stats.maxHealth.value);
        state.player.speed = playerBaseStats.speed * state.stats.moveSpeedMultiplier.value;
        state.player.turrets = state.turrets;

        const targetTurretCount = Math.floor(state.stats.turretCount.value);
        while (state.turrets.length < targetTurretCount) {
            const newAngle = (state.turrets.length / targetTurretCount) * Math.PI * 2;
            state.turrets.push(new Turret(newAngle, state.stats.turnSpeed.value));
        }
        while (state.turrets.length > targetTurretCount) {
            state.turrets.pop();
        }
        state.turrets.forEach(t => t.turnSpeed = state.stats.turnSpeed.value);

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

        if (upgradesList) {
            upgradesList.forEach((upg) => {
                if (upg.isAbility) {
                    state.abilityTimers[upg.id] = { readyTime: 0, activeUntil: 0, activeId: null, cooldownId: null };
                }
            });
        }

        StatsManager.recalculateStats(state, upgradesList);
        for (const key in state.upgrades) {
            if (upgradesList) {
                const upgDef = upgradesList.find((u) => u.id === key);
                if (upgDef) {
                    if (upgDef.isAbility) {
                        if (state.player && state.player.startingAbilities && state.player.startingAbilities.includes(key)) {
                            state.upgrades[key].baseLevel = 1;
                        } else {
                            state.upgrades[key].baseLevel = 0;
                        }
                    }
                    state.upgrades[key].baseLevel = Math.min(state.upgrades[key].baseLevel, upgDef.maxLevel);
                }
            }
            state.upgrades[key].level = state.upgrades[key].baseLevel;
            state.upgrades[key].ptsCost = state.stats.baseUpgradeCost.value;
        }

        if (state.player && state.player.startingAbilities) {
            state.player.startingAbilities.forEach((abilityId) => {
                state.abilities[abilityId] = true;
            });
        }

        if (upgradesList) {
            upgradesList.forEach((upg) => {
                if (upg.onRunStart && state.upgrades[upg.id] && state.upgrades[upg.id].baseLevel > 0) upg.onRunStart(state);
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
