import { perkSettings } from "../Config/Config.js";
import { upgradeCostAtLevel } from "../Config/configHelpers.js";
import {
    baseUpgradeDefinitions,
    metaUpgradeDefinitions,
    upgradeFromDefinition,
} from "../Config/UpgradeDefinitions.js";

export class Upgrade {
    constructor(config) {
        this.id = config.id;
        this.category = config.category;
        this.storageKey = `tower_${config.id.toLowerCase()}Level`;
        this.name = config.name;
        this.description = config.description;
        this.applyFn = config.applyFn;
        this.currentStrFn = config.currentStrFn || function() { return this.description; };
        this.nextStrFn = config.nextStrFn || null;
        this.updateFn = config.updateFn || null;
        this.maxLevel = config.maxLevel !== undefined ? config.maxLevel : Infinity;
        this.onPurchase = config.onPurchase || null;
        this.dynamicStrFn = config.dynamicStrFn || null;
        this.isAbility = config.isAbility || false;
        this.isPerk = config.isPerk || false;
        this.requires = config.requires || [];
        this.replaces = config.replaces || [];
        this.minPlayerLevel = config.minPlayerLevel || 0;
        this.cooldown = config.cooldown || 0;
        this.activeDuration = config.activeDuration || 0;
        this.triggerType = config.triggerType || null;
        this.blocksTargeting = config.blocksTargeting || false;
        this.speedModFn = config.speedModFn || null;
        this.onTrigger = config.onTrigger || null;
        this.onRunStart = config.onRunStart || null;
        this.onEnemyKilled = config.onEnemyKilled || null;
        this.onSectorEnd = config.onSectorEnd || null;
        this.turretLoadout = config.turretLoadout || null;
        this.toggleName = config.toggleName || null;
        this.showInHud = config.showInHud || false;
        this.hasToggle = config.hasToggle || false;
        this.usesRunStatsDisplay = config.usesRunStatsDisplay || false;
    }

    getUpgradeLevel(actor) {
        return actor.upgrades[this.id]?.level ?? 0;
    }

    getCurrentStr(state, actor = state.player) {
        const lvl = this.getUpgradeLevel(actor);
        const runStats = this.usesRunStatsDisplay ? state.runStats : undefined;
        const baseLvlVal = this.currentStrFn(lvl, actor, runStats);
        if (this.dynamicStrFn) {
            const currentVal = String(this.dynamicStrFn(actor));
            const baseStr = String(baseLvlVal);
            if (currentVal !== baseStr) {
                return `${baseStr} (${currentVal})`;
            }
        }
        return baseLvlVal;
    }

    getNextStr(state, actor = state.player) {
        const lvl = this.getUpgradeLevel(actor);
        const runStats = this.usesRunStatsDisplay ? state.runStats : undefined;
        return this.nextStrFn && this.nextStrFn(lvl, actor, runStats);
    }

    update(dt, state, actor = state.player) {
        const level = this.getUpgradeLevel(actor);
        if (this.updateFn && level > 0) this.updateFn(dt, actor, level);
    }
}

export function isBaseStatUpgrade(upgrade) {
    return (upgrade.category === "attack" || upgrade.category === "defense") && !upgrade.isAbility && !upgrade.isPerk;
}

const healthUpgradeDef = baseUpgradeDefinitions.find((def) => def.id === "Health");

export const createBaseUpgrades = () =>
    baseUpgradeDefinitions.map((def) => {
        const upgrade = upgradeFromDefinition(def, Upgrade);
        if (def.id === "Health") {
            upgrade.onPurchase = (state) => {
                state.player.heal(healthUpgradeDef.stat.perLevel);
            };
        }
        return upgrade;
    });

export const createUpgrades = () => [
    new Upgrade({
        id: "BaseCost1",
        category: "perk",
        name: "Base Cost 1",
        description: "Attack/Defense/Meta Starting Cost -20%.",
        maxLevel: 1,
        minPlayerLevel: 8,
        isPerk: true,
        applyFn: (_combat, run, level) => {
            run.baseUpgradeCost.flatModifiers -= perkSettings.baseCostReduction * level;
        },
        onPurchase: (state) => {
            for (const key in state.player.upgrades) {
                const cost = upgradeCostAtLevel(
                    state.runStats.baseUpgradeCost.value,
                    state.player.upgrades[key].level
                );
                state.player.upgrades[key].ptsCost = cost;
            }
        }
    }),
    new Upgrade({
        id: "Recovery1",
        category: "perk",
        name: "Recovery 1",
        description: "Recover up to +50% of max health at the end of each sector.",
        maxLevel: 1,
        isPerk: true,
        onSectorEnd: (state) => {
            const healAmount = state.player.maxHealth * perkSettings.recoverySectorHealRatio;
            state.player.heal(healAmount);
        }
    }),
    new Upgrade({
        id: "Regenerate1",
        category: "perk",
        name: "Regenerate 1",
        description: "Regenerate Starting Level +5.",
        maxLevel: 1,
        isPerk: true,
        onPurchase: (state) => {
            state.player.upgrades["Regen"].baseLevel += perkSettings.regenerateLevelBonus;
            state.player.upgrades["Regen"].level += perkSettings.regenerateLevelBonus;
        }
    }),
    new Upgrade({
        id: "FireRate1",
        category: "perk",
        name: "Fire Rate 1",
        description: "Fire Rate +10%.",
        maxLevel: 1,
        isPerk: true,
        applyFn: (combat, _run, level) => {
            combat.fireIntervalMultiplier.multiplierModifiers /= perkSettings.fireRateChargeTimeDivisor;
        }
    }),
    new Upgrade({
        id: "XPGain",
        category: "perk",
        name: "XP Gain 1",
        description: "XP Gain +100%.",
        maxLevel: 1,
        isPerk: true,
        onEnemyKilled: (state, enemy, xp) => {
            return xp * perkSettings.xpGainMultiplier;
        }
    }),
    new Upgrade({
        id: "StartingWealth",
        category: "perk",
        name: "Starting Wealth 1",
        description: "Start each run with +250 points.",
        maxLevel: 1,
        isPerk: true,
        onRunStart: (state) => {
            state.score += perkSettings.startingWealthPoints;
        },
        onPurchase: (state) => {
            state.score += perkSettings.startingWealthPoints;
        }
    }),
    // Ability order in this list defines shop branch order (see buildAbilityTreeLayout).
    new Upgrade({
        id: "Reposition",
        category: "abilities",
        name: "Reposition",
        isAbility: true,
        description: "Passive: Tap to move.",
        maxLevel: 1,
    }),
    new Upgrade({
        id: "Dive",
        category: "abilities",
        name: "Dive",
        description: "When Active: Double tap to dive in that direction. 1s cooldown.",
        maxLevel: 1,
        minPlayerLevel: 3,
        requires: ["Reposition"],
        isAbility: true,
        triggerType: "double_tap_move",
        cooldown: 1000,
        activeDuration: 400,
        blocksTargeting: true,
        speedModFn: (activeTimer, duration) => {
            const diveRatio = activeTimer / duration;
            return 1.0 + (12.0 * Math.pow(diveRatio, 0.5));
        },
        showInHud: true,
    }),
    new Upgrade({
        id: "Laser",
        category: "abilities",
        name: "Laser",
        description: "Passive: Replaces projectiles with a continuous laser beam. Turn Speed -50%.",
        maxLevel: 1,
        isAbility: true,
        replaces: ["TwinStrike", "TripleStrike"],
        turretLoadout: { gun: "beamLaser", scope: "all", priority: 30 },
    }),
    new Upgrade({
        id: "TargetVerification",
        category: "abilities",
        name: "Target Verification",
        toggleName: "Organic",
        description: "When Active: Laser ignores explosive props, only damaging enemies.",
        maxLevel: 1,
        isAbility: true,
        requires: ["Laser"],
        showInHud: true,
        hasToggle: true,
    }),
    new Upgrade({
        id: "TwoGuns",
        category: "abilities",
        name: "Two Guns",
        description: "When Active: Shoot two guns at once. Bullets deal half damage.",
        maxLevel: 1,
        isAbility: true,
        applyFn: (_combat, run, level) => {
            run.turretCount.flatModifiers += 1;
        },
        minPlayerLevel: 5
    }),
    new Upgrade({
        id: "ThreeGuns",
        category: "abilities",
        name: "Three Guns",
        description: "When Active: Shoot three guns at once. Bullets deal one-third damage.",
        maxLevel: 1,
        isAbility: true,
        requires: ['TwoGuns'],
        replaces: ['TwoGuns'],
        applyFn: (_combat, run, level) => {
            run.turretCount.flatModifiers += 2;
        },
        minPlayerLevel: 8
    }),
    new Upgrade({
        id: "TwinStrike",
        category: "abilities",
        name: "Twin Strike",
        description: "When Active: Fire 2 smaller projectiles at half damage.",
        maxLevel: 1,
        isAbility: true,
        turretLoadout: { preset: "twin", scope: "all", priority: 10 },
    }),
    new Upgrade({
        id: "TripleStrike",
        category: "abilities",
        name: "Triple Strike",
        description: "When Active: Fire 3 smaller projectiles at one-third damage.",
        maxLevel: 1,
        isAbility: true,
        requires: ['TwinStrike'],
        replaces: ['TwinStrike'],
        turretLoadout: { preset: "triple", scope: "all", priority: 20 },
    }),
    new Upgrade({
        id: "SteadyWeapon",
        category: "abilities",
        name: "Steady Weapon",
        description: "When Active: Accuracy + 33%, Fire Rate -33%, Move Speed -50%",
        maxLevel: 1,
        isAbility: true,
        applyFn: (combat, _run, level) => {
            combat.moveSpeedMultiplier.multiplierModifiers *= 0.5;
            combat.accuracy.flatModifiers += 0.33;
            combat.fireIntervalMultiplier.multiplierModifiers *= 1.33;
        },
        showInHud: true,
        hasToggle: true,
    }),
    new Upgrade({
        id: "Eraser",
        category: "abilities",
        name: "Eraser",
        description: "Passive: Player bullets destroy enemy bullets on impact.",
        isAbility: true,
        maxLevel: 1,
        minPlayerLevel: 3,
    }),
    ...metaUpgradeDefinitions.map((def) => upgradeFromDefinition(def, Upgrade)),
];