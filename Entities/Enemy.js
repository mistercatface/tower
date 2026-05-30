import { Actor } from "./Actor.js";
import { emitCombatEnemyKilled } from "../Core/EventSystem.js";
import { NAV_PROFILES } from "../Config/Config.js";
import { rollEnemyStartLoadout } from "../Combat/weaponLoadout.js";
import { createEntityBars } from "./EntityBars.js";
import {
    buildEnemyCombatStats,
    computeEnemyUpgradeLevels,
    computeSpawnReward,
} from "../Combat/EnemySpawn.js";

const enemyBars = createEntityBars({
    healthWidth: 22,
    healthHeight: 3,
    healthBorderRadius: 1.5,
});

export class Enemy extends Actor {
    static healthBar = enemyBars.healthBar;

    static spawn(x, y, enemyType, wave, baseUpgradeDefs) {
        const combatStats = buildEnemyCombatStats(enemyType);
        const reward = computeSpawnReward(wave, enemyType);
        const enemy = new Enemy(x, y, enemyType, combatStats, baseUpgradeDefs, reward);
        const levels = computeEnemyUpgradeLevels(wave, enemyType, combatStats);

        enemy.applySpawnUpgradeLevels(levels, baseUpgradeDefs);
        enemy.applyWeaponLoadout(rollEnemyStartLoadout());
        enemy.health = enemy.maxHealth;
        return enemy;
    }

    constructor(x, y, enemyType, combatStats, baseUpgradeDefs, reward) {
        super(
            x,
            y,
            enemyType.radius,
            combatStats.speed,
            combatStats.maxHealth,
            enemyType.color,
            enemyType.type,
            enemyType.accelRate ?? 3.0,
            enemyType.canDamageWalls ?? false
        );
        this.reward = reward;
        this.attackType = enemyType.attackType ?? "ranged";
        this.canDodge = enemyType.canDodge ?? false;
        this.enemyType = enemyType;
        this.setupCombatant(combatStats, baseUpgradeDefs);
        this.initCombatWeapon();
        this.isEngaged = false;
        this.blastAngle = 0;
        this.blastTimer = 0;
        this.dodgeTimerId = null;
        this.dodgeTargetX = 0;
        this.dodgeTargetY = 0;
        this.chargeCooldown = 0;
        this.startingAbilities = [];
        this.healthBar = Enemy.healthBar;
    }

    getDodgeChance() {
        if (this.canDodge) return 0.5;
        return super.getDodgeChance();
    }

    onHitAfterDamage(_damage, _ctx, _hitType, died) {
        if (died) {
            emitCombatEnemyKilled(this);
        }
    }

    updateCombat(dt, state, spatialHash, options = {}) {
        if (this.handleCombatDodge(dt, state, spatialHash, options)) {
            return;
        }

        const target = this.getAITarget(state);

        if (!target) {
            this.desiredX = 0;
            this.desiredY = 0;
            this.applyLocomotion(dt, state.walls, spatialHash, { state, ignoreSeparationInDesired: true });
            this.updateTurretCombat(dt, state, options);
            return;
        }

        this.currentState.update(
            this,
            dt,
            target,
            state.flowFieldGrid,
            state.walls,
            state.projectiles,
            spatialHash,
            state.scheduler,
            state
        );
        this.updateTurretCombat(dt, state, options);
    }

    calculateSteering(target, state) {
        state.navigation.steerTo(this, target.x, target.y, NAV_PROFILES.enemyToPlayer);
    }

    canReposition(state) {
        return false;
    }

    render(ctx, renderer, state) {
        if (this.currentState && this.currentState.render) {
            this.currentState.render(this, ctx, renderer.actorCache, renderer.turretCache);
        }

        this.renderBody(ctx, renderer);
    }
}
