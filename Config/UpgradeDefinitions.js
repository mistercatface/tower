import { runBaseStats } from "./Config.js";

export const REGEN_HP_PER_LEVEL = 0.25;
export const REGEN_MAX_LEVEL = 8;

export function regenHpPerSec(level) {
    return level * REGEN_HP_PER_LEVEL;
}

function formatRegenRate(level) {
    return `${parseFloat(regenHpPerSec(level).toFixed(2))} HP/s`;
}

export const RELOAD_SPEED_BONUS_PER_LEVEL = 0.05;
export const RELOAD_SPEED_MAX_LEVEL = 4;

function formatReloadSpeedBonus(level) {
    return `+${Math.round(level * RELOAD_SPEED_BONUS_PER_LEVEL * 100)}%`;
}

export const baseUpgradeDefinitions = [
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
        id: "ReloadSpeed",
        category: "attack",
        name: "Reload Speed",
        description: "Reload weapons faster.",
        stat: { target: "combat", key: "reloadSpeedMultiplier", op: "flatAdd", perLevel: RELOAD_SPEED_BONUS_PER_LEVEL },
        maxLevel: RELOAD_SPEED_MAX_LEVEL,
        display: {
            current: (level) => formatReloadSpeedBonus(level),
            next: (level) => formatReloadSpeedBonus(level + 1),
        },
        dynamic: (actor) => `+${Math.round((actor.stats.reloadSpeedMultiplier.value - 1) * 100)}%`,
    },
    {
        id: "Health",
        category: "defense",
        name: "Health",
        description: "Increases maximum health.",
        stat: { target: "combat", key: "maxHealth", op: "flatAdd", perLevel: 1 },
        display: {
            current: (level, actor) => actor.stats.maxHealth.baseValue + level,
            next: (level, actor) => actor.stats.maxHealth.baseValue + level + 1,
        },
    },
    {
        id: "Regen",
        category: "defense",
        name: "Regenerate",
        description: "Restore health over time.",
        maxLevel: REGEN_MAX_LEVEL,
        update: { type: "healOverTime", perLevel: REGEN_HP_PER_LEVEL },
        display: {
            current: (level) => formatRegenRate(level),
            next: (level) => formatRegenRate(level + 1),
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

const moveSpeedDef = baseUpgradeDefinitions.find((def) => def.id === "MoveSpeed");

export const baseUpgradeEffects = {
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
