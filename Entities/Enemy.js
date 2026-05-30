import { Utilities } from "../Core/Utilities.js";
import { RenderSprites } from "../Render/RenderSprites.js";
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

    static updateAll(state, dt, spatialHash) {
        for (let i = state.enemies.length - 1; i >= 0; i--) {
            const e = state.enemies[i];
            e.currentState.update(e, dt, e.getAITarget(state), state.flowFieldGrid, state.walls, state.projectiles, spatialHash, state.scheduler, state);
            if (e.isDead) state.enemies.splice(i, 1);
        }
    }

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

    onHitAfterDamage(_damage, _ctx, _hitType, died) {
        if (died) {
            emitCombatEnemyKilled(this);
        }
    }

    calculateSteering(target, state) {
        state.navigation.steerTo(this, target.x, target.y, NAV_PROFILES.enemyToPlayer);
    }

    shouldTriggerDodge(projectiles, flowFieldGrid, scheduler) {
        for (const m of projectiles) {
            if (m.faction === "enemy") continue;

            const dist = Math.hypot(m.x - this.x, m.y - this.y);
            if (dist < 100 && !m.isDead) {
                const angleToEnemy = Math.atan2(this.y - m.y, this.x - m.x);
                let angleDiff = angleToEnemy - m.angle;
                angleDiff = Utilities.normalizeAngle(angleDiff);

                if (Math.abs(angleDiff) < 0.5) {
                    if (Math.random() < 0.5) {
                        const perpAngle1 = m.angle + Math.PI / 2;
                        const perpAngle2 = m.angle - Math.PI / 2;
                        const dodgeDist = 25;
                        const angles = Math.random() < 0.5 ? [perpAngle1, perpAngle2] : [perpAngle2, perpAngle1];

                        for (const dodgeAngle of angles) {
                            const destX = this.x + Math.cos(dodgeAngle) * dodgeDist;
                            const destY = this.y + Math.sin(dodgeAngle) * dodgeDist;

                            if (this.isValidDodgeTarget(destX, destY, flowFieldGrid)) {
                                this.dodgeTargetX = destX;
                                this.dodgeTargetY = destY;
                                this.dodgeTimerId = scheduler.schedule(2000);
                                return true;
                            }
                        }
                    } else {
                        this.dodgeTimerId = scheduler.schedule(500);
                    }
                }
            }
        }
        return false;
    }

    isValidDodgeTarget(x, y, flowFieldGrid) {
        if (!flowFieldGrid) return true;
        const { col, row } = flowFieldGrid.worldToGrid(x, y);
        if (col >= 0 && col < flowFieldGrid.cols && row >= 0 && row < flowFieldGrid.rows) {
            return flowFieldGrid.grid[row * flowFieldGrid.cols + col] === 0;
        }
        return false;
    }

    canReposition(state) {
        return false;
    }

    renderStatusBars(ctx, renderer, _state) {
        super.renderStatusBars(ctx, renderer.enemyCache, 14);
    }

    render(ctx, renderer, state) {
        if (this.currentState && this.currentState.render) {
            this.currentState.render(this, ctx, renderer.enemyCache, renderer.turretCache);
        }

        const cacheKey = `${this.radius}_${this.color}`;
        this.renderCachedSprite(ctx, renderer.enemyCache, cacheKey, RenderSprites.enemy, this.radius, this.color);
        this.renderTurrets(ctx, renderer, this.color);
    }
}
