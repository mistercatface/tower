import { runBaseStats } from "./Config.js";

export const baseUpgradeDefinitions = [
    {
        id: "Damage",
        category: "attack",
        name: "Damage",
        description: "Increases base weapon damage.",
        stat: { target: "combat", key: "damage", op: "flatAdd", perLevel: 1 },
        display: {
            current: (level, actor) => actor.stats.damage.baseValue + level,
            next: (level, actor) => actor.stats.damage.baseValue + level + 1,
        },
        dynamic: (actor) => actor.weapon?.damage,
    },
    {
        id: "Accuracy",
        category: "attack",
        name: "Accuracy",
        description: "Reduces weapon spread.",
        stat: { target: "combat", key: "accuracy", op: "flatAdd", perLevel: 0.01 },
        maxLevel: 25,
        display: {
            current: (level, actor) => `${Math.round(actor.stats.accuracy.baseValue * 100) + level}%`,
            next: (level, actor) => `${Math.round(actor.stats.accuracy.baseValue * 100) + level + 1}%`,
        },
        dynamic: (actor) => `${(actor.weapon.accuracy * 100).toFixed(0)}%`,
    },
    {
        id: "Penetration",
        category: "attack",
        name: "Penetration",
        description: "Projectiles pierce enemies they kill.",
        stat: { target: "combat", key: "penetration", op: "flatAdd", perLevel: 1 },
        maxLevel: 2,
        display: {
            current: (level) => `+${level}`,
            next: (level) => `+${level + 1}`,
        },
    },
    {
        id: "Speed",
        category: "attack",
        name: "Turn Speed",
        description: "Increases turret rotation speed.",
        stat: { target: "combat", key: "turnSpeed", op: "flatAdd", perLevel: Math.PI * 0.5 },
        display: {
            current: (level, actor) => `${(actor.stats.turnSpeed.baseValue / Math.PI + level * 0.5).toFixed(1)}π`,
            next: (level, actor) => `${(actor.stats.turnSpeed.baseValue / Math.PI + (level + 1) * 0.5).toFixed(1)}π`,
        },
    },
    {
        id: "Charge",
        category: "attack",
        name: "Fire Rate",
        description: "Reduces time between shots.",
        stat: { target: "combat", key: "chargeTime", op: "flatSubtract", perLevel: 100 },
        maxLevel: 18,
        display: {
            current: (level, actor) => `${Math.max(actor.stats.chargeTime.min, actor.stats.chargeTime.baseValue - level * 50)}ms`,
            next: (level, actor) => `${Math.max(actor.stats.chargeTime.min, actor.stats.chargeTime.baseValue - (level + 1) * 50)}ms`,
        },
        dynamic: (actor) => `${actor.weapon.chargeTime.toFixed(0)}ms`,
    },
    {
        id: "Range",
        category: "attack",
        name: "Range",
        description: "Increases weapon targeting range.",
        stat: { target: "combat", key: "range", op: "flatAdd", perLevel: 10 },
        display: {
            current: (level, actor) => actor.stats.range.baseValue + level * 10,
            next: (level, actor) => actor.stats.range.baseValue + (level + 1) * 10,
        },
    },
    {
        id: "Health",
        category: "defense",
        name: "Health",
        description: "Increases maximum health.",
        stat: { target: "combat", key: "maxHealth", op: "flatAdd", perLevel: 20 },
        display: {
            current: (level, actor) => actor.stats.maxHealth.baseValue + level * 20,
            next: (level, actor) => actor.stats.maxHealth.baseValue + (level + 1) * 20,
        },
    },
    {
        id: "Regen",
        category: "defense",
        name: "Regenerate",
        description: "Restore health over time.",
        update: { type: "healOverTime", perLevel: 1 },
        display: {
            current: (level) => `${level} HP/s`,
            next: (level) => `${level + 1} HP/s`,
        },
    },
    {
        id: "MoveSpeed",
        category: "defense",
        name: "Move Speed",
        description: "Increases movement speed.",
        stat: { target: "combat", key: "moveSpeedMultiplier", op: "flatAdd", perLevel: 0.25 },
        maxLevel: 4,
        display: {
            current: (level, actor) => `x${(actor.stats.moveSpeedMultiplier.baseValue + level * 0.25).toFixed(2)}`,
            next: (level, actor) => `x${(actor.stats.moveSpeedMultiplier.baseValue + (level + 1) * 0.25).toFixed(2)}`,
        },
        dynamic: (actor) => `x${(actor.speed / actor.baseMoveSpeed).toFixed(2)}`,
    },
];

export const metaUpgradeDefinitions = [
    {
        id: "GameSpeed",
        category: "meta",
        name: "Game Speed",
        description: "Unlocks faster game speed options.",
        stat: { target: "run", key: "gameSpeed", op: "flatAdd", perLevel: 0.25 },
        maxLevel: 2,
        display: {
            current: (level, _actor, runStats) => `x${(runStats.gameSpeed.baseValue + level * 0.25).toFixed(2)}`,
            next: (level, _actor, runStats) => `x${(runStats.gameSpeed.baseValue + (level + 1) * 0.25).toFixed(2)}`,
        },
    },
    {
        id: "Points",
        category: "meta",
        name: "Bonus Points",
        description: "Bonus points per kill.",
        stat: { target: "run", key: "pointBonus", op: "flatAdd", perLevel: 1 },
        display: {
            current: (level, _actor, runStats) => `+${runStats.pointBonus.baseValue + level}`,
            next: (level, _actor, runStats) => `+${runStats.pointBonus.baseValue + level + 1}`,
        },
    },
];

const healthDef = baseUpgradeDefinitions.find((def) => def.id === "Health");
const moveSpeedDef = baseUpgradeDefinitions.find((def) => def.id === "MoveSpeed");

export const baseUpgradeEffects = {
    healthPerLevel: healthDef.stat.perLevel,
    moveSpeedPerLevel: moveSpeedDef.stat.perLevel,
    moveSpeedMaxLevel: moveSpeedDef.maxLevel,
};

export function buildApplyFn(statDef) {
    if (!statDef) return null;

    const { target, key, op, perLevel } = statDef;
    return (combat, run, level) => {
        const stats = target === "run" ? run : combat;
        if (!stats?.[key]) return;

        const amount = level * perLevel;
        switch (op) {
            case "flatAdd":
                stats[key].flatModifiers += amount;
                break;
            case "flatSubtract":
                stats[key].flatModifiers -= amount;
                break;
            case "multiplierDivide":
                stats[key].multiplierModifiers /= perLevel;
                break;
            default:
                break;
        }
    };
}

export function buildUpdateFn(updateDef) {
    if (!updateDef) return null;

    if (updateDef.type === "healOverTime") {
        return (dt, actor, level) => {
            if (!actor.addHealAccumulator) return;

            if (actor.health < actor.maxHealth) {
                actor.addHealAccumulator(level * updateDef.perLevel * (dt / 1000));
            } else {
                actor.clearHealAccumulator();
            }
        };
    }

    return null;
}

export function upgradeFromDefinition(def, UpgradeClass) {
    return new UpgradeClass({
        id: def.id,
        category: def.category,
        name: def.name,
        description: def.description,
        maxLevel: def.maxLevel,
        applyFn: buildApplyFn(def.stat),
        currentStrFn: def.display?.current,
        nextStrFn: def.display?.next,
        dynamicStrFn: def.dynamic,
        updateFn: buildUpdateFn(def.update),
        usesRunStatsDisplay: def.stat?.target === "run",
    });
}
