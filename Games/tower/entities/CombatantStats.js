import { Stat } from "../../../GameState/Stat.js";
import { defaultUpgradeCost } from "../../../Config/Config.js";
export function createCombatantStats(baseStats) {
    return {
        turnSpeed: new Stat(baseStats.turnSpeed),
        range: new Stat(baseStats.range),
        maxHealth: new Stat(baseStats.maxHealth),
        accuracy: new Stat(baseStats.accuracy),
        penetration: new Stat(baseStats.penetration),
        moveSpeedMultiplier: new Stat(baseStats.moveSpeedMultiplier),
        fireIntervalMultiplier: new Stat(baseStats.fireIntervalMultiplier ?? 1),
        reloadSpeedMultiplier: new Stat(baseStats.reloadSpeedMultiplier ?? 1),
    };
}
export function createRunStats(runBaseStats) {
    return {
        gameSpeed: new Stat(runBaseStats.gameSpeed),
        pointBonus: new Stat(runBaseStats.pointBonus),
        baseUpgradeCost: new Stat(runBaseStats.baseUpgradeCost ?? defaultUpgradeCost),
        turretCount: new Stat(runBaseStats.turretCount),
    };
}
export function createUpgradeLevels(upgradeList, cost = defaultUpgradeCost) {
    const upgrades = {};
    for (const upg of upgradeList) upgrades[upg.id] = { level: 0, baseLevel: 0, ptsCost: cost };
    return upgrades;
}
export function resetUpgradeLevels(upgrades) {
    for (const key in upgrades) {
        upgrades[key].baseLevel = 0;
        upgrades[key].level = 0;
    }
}
export function initCombatantUpgradeSlots(upgrades, upgradeDefs) {
    for (const def of upgradeDefs) upgrades[def.id] = { level: 0, baseLevel: 0 };
}
export function applyUpgrades(combatStats, runStats, upgradeLevels, upgradeDefs, shouldApply) {
    for (const key in combatStats) combatStats[key].reset();
    if (runStats) for (const key in runStats) runStats[key].reset();
    for (const upg of upgradeDefs) {
        const level = upgradeLevels[upg.id]?.level ?? 0;
        if (level > 0 && upg.applyFn && shouldApply(upg, level)) upg.applyFn(combatStats, runStats, level);
    }
}
export function applyUpgradesToStats(combatStats, upgradeLevels, upgradeDefs, shouldApply) {
    applyUpgrades(combatStats, null, upgradeLevels, upgradeDefs, shouldApply);
}
export function syncActorCombatFromStats(actor, stats, baseMoveSpeed) {
    if (!actor.weapon) return;
    actor.weapon.range = stats.range.value;
    actor.weapon.penetration = stats.penetration.value;
    actor.weapon.accuracy = Math.min(1, stats.accuracy.value);
    if (baseMoveSpeed !== undefined) {
        actor.baseMoveSpeed = baseMoveSpeed;
        actor.speed = baseMoveSpeed * stats.moveSpeedMultiplier.value;
    }
    actor.updateMaxHealth(stats.maxHealth.value);
    actor.turnSpeed = stats.turnSpeed.value;
    actor.setTurretTurnSpeed(stats.turnSpeed.value);
}
