import { Projectile } from "./Entities/Projectile.js";
import { WeaponSystem, ContinuousWeaponMode, ChargedWeaponMode } from "./WeaponSystem.js";
import { PhysicsSystem } from "./Spatial/PhysicsSystem.js";
import { playerBaseStats, playerProjectileSettings } from "./Config.js";

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
        this.abilityApplyFn = config.abilityApplyFn || null;
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
        this.weaponMode = config.weaponMode || null;
        this.toggleName = config.toggleName || null;
        this.showInHud = config.showInHud || false;
        this.hasToggle = config.hasToggle || false;
    }

    getCurrentStr(state) {
        const lvl = state.upgrades[this.id].level;
        const baseLvlVal = this.currentStrFn(lvl);
        if (this.dynamicStrFn) {
            const currentVal = String(this.dynamicStrFn(state));
            const baseStr = String(baseLvlVal);
            if (currentVal !== baseStr) {
                return `${baseStr} (${currentVal})`;
            }
        }
        return baseLvlVal;
    }

    getNextStr(state) {
        const lvl = state.upgrades[this.id].level;
        return this.nextStrFn && this.nextStrFn(lvl);
    }

    update(dt, state) {
        const level = state.upgrades[this.id].level;
        if (this.updateFn && level > 0) this.updateFn(dt, state, level);
    }
}

export const createBaseUpgrades = () => [
    new Upgrade({
        id: "Damage",
        category: "attack",
        name: "Damage",
        description: "Increases base weapon damage.",
        applyFn: (stats, level) => { stats.damage.flatModifiers += level; },
        currentStrFn: (level) => 1 + level,
        nextStrFn: (level) => 1 + (level + 1),
        dynamicStrFn: (state) => state.weapon.damage
    }),
    new Upgrade({
        id: "Accuracy",
        category: "attack",
        name: "Accuracy",
        description: "Reduces weapon spread.",
        applyFn: (stats, level) => { stats.accuracy.flatModifiers += level * 0.01; },
        currentStrFn: (level) => (50 + level) + "%",
        nextStrFn: (level) => (50 + level + 1) + "%",
        maxLevel: 45,
        dynamicStrFn: (state) => (state.weapon.accuracy * 100).toFixed(0) + "%"
    }),
    new Upgrade({
        id: "Penetration",
        category: "attack",
        name: "Penetration",
        description: "Projectiles pierce enemies they kill.",
        applyFn: (stats, level) => { stats.penetration.flatModifiers += level; },
        currentStrFn: (level) => "+" + level,
        nextStrFn: (level) => "+" + (level + 1),
        maxLevel: 2
    }),
    new Upgrade({
        id: "Speed",
        category: "attack",
        name: "Turn Speed",
        description: "Increases turret rotation speed.",
        applyFn: (stats, level) => { stats.turnSpeed.flatModifiers += level * Math.PI * 0.5; },
        currentStrFn: (level) => (3 + level * 0.5).toFixed(1) + "π",
        nextStrFn: (level) => (3 + (level + 1) * 0.5).toFixed(1) + "π"
    }),
    new Upgrade({
        id: "Charge",
        category: "attack",
        name: "Fire Rate",
        description: "Reduces time between shots.",
        applyFn: (stats, level) => { stats.chargeTime.flatModifiers -= level * 100; },
        currentStrFn: (level) => Math.max(100, 1000 - level * 50) + "ms",
        nextStrFn: (level) => Math.max(100, 1000 - (level + 1) * 50) + "ms",
        maxLevel: 18,
        dynamicStrFn: (state) => state.weapon.chargeTime.toFixed(0) + "ms"
    }),
    new Upgrade({
        id: "Range",
        category: "attack",
        name: "Range",
        description: "Increases weapon targeting range.",
        applyFn: (stats, level) => { stats.range.flatModifiers += level * 10; },
        currentStrFn: (level) => 150 + level * 10,
        nextStrFn: (level) => 150 + (level + 1) * 10
    }),
    new Upgrade({
        id: "Health",
        category: "defense",
        name: "Health",
        description: "Increases maximum planet health.",
        applyFn: (stats, level) => { stats.maxHealth.flatModifiers += level * 20; },
        currentStrFn: (level) => 100 + level * 20,
        nextStrFn: (level) => 100 + (level + 1) * 20,
        onPurchase: (state) => { state.planet.heal(20); }
    }),
    new Upgrade({
        id: "Regen",
        category: "defense",
        name: "Regenerate",
        description: "Restore health over time.",
        currentStrFn: (level) => level + " HP/s",
        nextStrFn: (level) => (level + 1) + " HP/s",
        updateFn: (dt, state, level) => {
            if (state.planet.health < state.planet.maxHealth) {
                state.planet.addHealAccumulator(level * (dt / 1000));
            } else {
                state.planet.clearHealAccumulator();
            }
        },
    }),
    new Upgrade({
        id: "Mitigation",
        category: "defense",
        name: "Mitigation",
        description: "Reduces incoming damage by a percentage.",
        applyFn: (stats, level) => { stats.mitigation.flatModifiers += level * 0.01; },
        currentStrFn: (level) => (1 + level) + "%",
        nextStrFn: (level) => (2 + level) + "%",
        maxLevel: 74
    }),
    new Upgrade({
        id: "MoveSpeed",
        category: "defense",
        name: "Move Speed",
        description: "Increases planet movement speed.",
        applyFn: (stats, level) => { stats.moveSpeedMultiplier.flatModifiers += level * 0.25; },
        currentStrFn: (level) => "x" + (1.0 + level * 0.25).toFixed(2),
        nextStrFn: (level) => "x" + (1.0 + (level + 1) * 0.25).toFixed(2),
        maxLevel: 4,
        dynamicStrFn: (state) => "x" + (state.planet.moveSpeed / playerBaseStats.moveSpeed).toFixed(2)
    }),
]

export const createUpgrades = () => [
    new Upgrade({
        id: "BaseCost1",
        category: "perk",
        name: "Base Cost 1",
        description: "Attack/Defense/Meta Starting Cost -20%.",
        maxLevel: 1,
        minPlayerLevel: 8,
        isPerk: true,
        applyFn: (stats, level) => {
            stats.baseUpgradeCost.flatModifiers -= 10 * level;
        },
        onPurchase: (state) => {
            for (const key in state.upgrades) {
                let cost = state.stats.baseUpgradeCost.value;
                for (let i = 0; i < state.upgrades[key].level; i++) {
                    cost = Math.floor(cost * 1.5);
                }
                state.upgrades[key].ptsCost = cost;
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
            const healAmount = state.planet.maxHealth * 0.5;
            state.planet.heal(healAmount);
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
            state.upgrades["Regen"].baseLevel += 5;
            state.upgrades["Regen"].level += 5;
        }
    }),
    new Upgrade({
        id: "FireRate1",
        category: "perk",
        name: "Fire Rate 1",
        description: "Fire Rate +10%.",
        maxLevel: 1,
        isPerk: true,
        applyFn: (stats, level) => {
            stats.chargeTime.multiplierModifiers /= 1.1;
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
            return xp * 2;
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
            state.score += 250;
        },
        onPurchase: (state) => {
            state.score += 250;
        }
    }),
    new Upgrade({
        id: "Laser",
        category: "abilities",
        name: "Laser",
        description: "Passive: Replaces projectiles with a continuous laser beam. Turn Speed -50%.",
        maxLevel: 1,
        isAbility: true,
        replaces: ["TwinStrike", "TripleStrike"],
        applyFn: (stats, level) => {
            stats.turnSpeed.multiplierModifiers *= 0.5;
        },
        abilityApplyFn: (weapon, planet) => {
            weapon.damage *= 0.33;
        },
        weaponMode: new ContinuousWeaponMode((dt, state, tx, ty, turret, combatEvents) => {
            turret.laserTimer = (turret.laserTimer || 0) + dt;
            let laserCanDamage = false;
            if (turret.laserTimer >= 200) {
                laserCanDamage = true;
                turret.laserTimer = 0;
            }
            const baseGrowthSpeed = 200;
            const growthSpeed = baseGrowthSpeed * Math.sqrt(1000 / state.weapon.chargeTime);
            turret.currentLaserLength = (turret.currentLaserLength || 0) + growthSpeed * (dt / 1000);
            turret.currentLaserLength = Math.min(state.weapon.range, turret.currentLaserLength);

            const accuracySpread = (1 - state.weapon.accuracy) * (Math.PI / 12);
            const laserAngle = turret.angle + Math.sin((state.lastTime || Date.now()) / 150) * accuracySpread;
            const hit = WeaponSystem.castLaser(tx, ty, laserAngle, turret.currentLaserLength, state);
            turret.currentLaserLength = hit.dist;

            state.activeLasers.push({ x1: tx, y1: ty, x2: hit.x, y2: hit.y });
            if (laserCanDamage) {
                if (hit.hit === "enemy") {
                    combatEvents.push({ target: hit.entity, damage: state.weapon.damage });
                } else if (hit.hit === "pickup" && hit.entity.strategy && hit.entity.strategy.onHit) {
                    if (!state.abilities["TargetVerification"]) {
                        hit.entity.strategy.onHit(state, hit.entity, { isDead: false }, combatEvents);
                    }
                }
            }
        })
    }),
    new Upgrade({
        id: "TargetVerification",
        category: "abilities",
        name: "Target Verification",
        toggleName: "Organic",
        description: "When Active: Laser ignores explosive barrels, only damaging enemies.",
        maxLevel: 1,
        isAbility: true,
        requires: ["Laser"],
        showInHud: true,
        hasToggle: true
    }),
    new Upgrade({
        id: "Dive",
        category: "abilities",
        name: "Dive",
        description: "When Active: Double tap to dive in that direction. 1s cooldown.",
        maxLevel: 1,
        minPlayerLevel: 3,
        requires: ['Reposition'],
        isAbility: true,
        triggerType: 'double_tap_move',
        cooldown: 1000,
        activeDuration: 400,
        blocksTargeting: true,
        speedModFn: (activeTimer, duration) => {
            const diveRatio = activeTimer / duration;
            return 1.0 + (12.0 * Math.pow(diveRatio, 0.5));
        },
        showInHud: true
    }),
    new Upgrade({
        id: "TwoGuns",
        category: "abilities",
        name: "Two Guns",
        description: "When Active: Shoot two guns at once. Bullets deal half damage.",
        maxLevel: 1,
        isAbility: true,
        applyFn: (stats, level) => {
            stats.turretCount.flatModifiers += 1;
        },
        abilityApplyFn: (weapon, planet) => {
            weapon.damage *= 0.5;
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
        applyFn: (stats, level) => {
            stats.turretCount.flatModifiers += 2;
        },
        abilityApplyFn: (weapon, planet) => {
            weapon.damage *= 0.33;
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
        abilityApplyFn: (weapon, planet) => {
            weapon.damage *= 0.5;
        },
        weaponMode: new ChargedWeaponMode((state, tx, ty, turretAngle, source) => {
            const accuracySpread = ((1 - state.weapon.accuracy) * Math.PI) / 2;
            const spreadAngle = (Math.random() - 0.5) * accuracySpread;
            const finalAngle = turretAngle + spreadAngle;
            const r = state.planet.radius * playerProjectileSettings.splitRadiusMultiplier;
            const m1 = new Projectile(tx, ty, r, playerProjectileSettings.speed, null, finalAngle - 0.1, 0, "player");
            const m2 = new Projectile(tx, ty, r, playerProjectileSettings.speed, null, finalAngle + 0.1, 0, "player");
            m1.penetration = state.weapon.penetration;
            m2.penetration = state.weapon.penetration;
            state.projectiles.push(m1, m2);
            if (source) {
                PhysicsSystem.applyKnockback(source, finalAngle + Math.PI, (m1.radius + m2.radius) * playerProjectileSettings.knockbackMultiplier);
            }
        })
    }),
    new Upgrade({
        id: "TripleStrike",
        category: "abilities",
        name: "Triple Strike",
        description: "When Active: Fire 3 smaller projectiles at one-third damage.",
        maxLevel: 1,
        isAbility: true,
        abilityApplyFn: (weapon, planet) => {
            weapon.damage *= 0.33;
        },
        requires: ['TwinStrike'],
        replaces: ['TwinStrike'],
        weaponMode: new ChargedWeaponMode((state, tx, ty, turretAngle, source) => {
            const accuracySpread = ((1 - state.weapon.accuracy) * Math.PI) / 2;
            const spreadAngle = (Math.random() - 0.5) * accuracySpread;
            const finalAngle = turretAngle + spreadAngle;
            const r = state.planet.radius * playerProjectileSettings.splitRadiusMultiplier;
            const m1 = new Projectile(tx, ty, r, playerProjectileSettings.speed, null, finalAngle - 0.1, 0, "player");
            const m2 = new Projectile(tx, ty, r, playerProjectileSettings.speed, null, finalAngle + 0.1, 0, "player");
            const m3 = new Projectile(tx, ty, r, playerProjectileSettings.speed, null, finalAngle + Math.random() * 0.1, 0, "player");
            m1.penetration = state.weapon.penetration;
            m2.penetration = state.weapon.penetration;
            m3.penetration = state.weapon.penetration;
            state.projectiles.push(m1, m2, m3);
            if (source) {
                PhysicsSystem.applyKnockback(source, finalAngle + Math.PI, (m1.radius + m2.radius + m3.radius) * playerProjectileSettings.knockbackMultiplier);
            }
        })
    }),
    new Upgrade({
        id: "SteadyWeapon",
        category: "abilities",
        name: "Steady Weapon",
        description: "When Active: Accuracy + 33%, Fire Rate -33%, Move Speed -50%",
        maxLevel: 1,
        isAbility: true,
        abilityApplyFn: (weapon, planet) => {
            weapon.chargeTime *= 1.33;
            planet.moveSpeed *= 0.5;
            weapon.accuracyModifier += 0.33;
        },
        showInHud: true,
        hasToggle: true
    }),
    new Upgrade({
        id: "Reposition",
        category: "abilities",
        name: "Reposition",
        isAbility: true,
        description: "Passive: Tap to move.",
        maxLevel: 1,
    }),
    new Upgrade({
        id: "Eraser",
        category: "abilities",
        name: "Eraser",
        description: "Passive: Player bullets destroy enemy bullets on impact.",
        isAbility: true,
        maxLevel: 1,
        minPlayerLevel: 3
    }),
    new Upgrade({
        id: "GameSpeed",
        category: "meta",
        name: "Game Speed",
        description: "Unlocks faster game speed options.",
        applyFn: (stats, level) => { stats.gameSpeed.flatModifiers += level * 0.25; },
        currentStrFn: (level) => "x" + (2.0 + level * 0.25).toFixed(2),
        nextStrFn: (level) => "x" + (2.0 + (level + 1) * 0.25).toFixed(2),
        maxLevel: 64,
    }),
    new Upgrade({
        id: "Points",
        category: "meta",
        name: "Bonus Points",
        description: "Bonus points per kill.",
        applyFn: (stats, level) => { stats.pointBonus.flatModifiers += level; },
        currentStrFn: (level) => "+" + level,
        nextStrFn: (level) => "+" + (level + 1),
    })
];