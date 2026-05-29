import { Stat } from "../GameState/Stat.js";
import { defaultUpgradeCost } from "../Config/Config.js";

export function createCombatantStats(baseStats) {
    return {
        damage: new Stat(baseStats.damage),
        turnSpeed: new Stat(baseStats.turnSpeed),
        chargeTime: new Stat(baseStats.chargeTime, baseStats.minChargeTime, baseStats.maxChargeTime),
        range: new Stat(baseStats.range),
        maxHealth: new Stat(baseStats.maxHealth),
        gameSpeed: new Stat(baseStats.gameSpeed),
        pointBonus: new Stat(0),
        accuracy: new Stat(baseStats.accuracy),
        penetration: new Stat(baseStats.penetration),
        moveSpeedMultiplier: new Stat(baseStats.moveSpeedMultiplier),
        baseUpgradeCost: new Stat(defaultUpgradeCost),
        turretCount: new Stat(baseStats.turretCount),
    };
}

export function createUpgradeLevels(upgradeList, cost = defaultUpgradeCost) {
    const upgrades = {};
    for (const upg of upgradeList) {
        upgrades[upg.id] = { level: 0, baseLevel: 0, ptsCost: cost };
    }
    return upgrades;
}

export function resetUpgradeLevels(upgrades) {
    for (const key in upgrades) {
        upgrades[key].baseLevel = 0;
        upgrades[key].level = 0;
    }
}

export function initCombatantUpgradeSlots(upgrades, upgradeDefs) {
    for (const def of upgradeDefs) {
        upgrades[def.id] = { level: 0, baseLevel: 0 };
    }
}

export function applyUpgradesToStats(stats, upgradeLevels, upgradeDefs, shouldApply) {
    for (const key in stats) {
        stats[key].reset();
    }
    for (const upg of upgradeDefs) {
        const level = upgradeLevels[upg.id]?.level ?? 0;
        if (level > 0 && upg.applyFn && shouldApply(upg, level)) {
            upg.applyFn(stats, level);
        }
    }
}

export function syncActorCombatFromStats(actor, stats, baseMoveSpeed) {
    if (!actor.weapon) return;

    actor.weapon.accuracyModifier = 0;
    actor.weapon.damage = stats.damage.value;
    actor.weapon.range = stats.range.value;
    actor.weapon.chargeTime = stats.chargeTime.value;
    actor.weapon.penetration = stats.penetration.value;

    const accuracyDesc = Object.getOwnPropertyDescriptor(actor.weapon, "accuracy");
    if (!accuracyDesc?.get) {
        actor.weapon.accuracy = stats.accuracy.value;
    }

    if (typeof actor.updateMaxHealth === "function") {
        actor.updateMaxHealth(stats.maxHealth.value);
    } else {
        actor.maxHealth = stats.maxHealth.value;
        actor.health = Math.min(actor.health, actor.maxHealth);
    }

    if (baseMoveSpeed !== undefined) {
        actor.baseMoveSpeed = baseMoveSpeed;
        actor.speed = baseMoveSpeed * stats.moveSpeedMultiplier.value;
    }

    if (actor.turret) {
        actor.turret.turnSpeed = stats.turnSpeed.value;
    } else {
        actor.turnSpeed = stats.turnSpeed.value;
    }
}
