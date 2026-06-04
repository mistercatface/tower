import { normalizeAngle } from "../Math/Angle.js";
import { areHostile } from "../Combat/Targeting.js";
import { Actor } from "./Actor.js";
import { emitCombatEnemyKilled } from "../Core/EventSystem.js";
import { NAV_PROFILES } from "../Config/Config.js";
import { rollEnemyStartLoadout } from "../Combat/weaponLoadout.js";
import { createEntityBars } from "./EntityBars.js";
import { buildEnemyCombatStats, computeEnemyUpgradeLevels, computeSpawnReward } from "../Combat/EnemySpawn.js";
import { renderActorKinematicsBody } from "../Render/Kinematics/PlayerKinematicsRenderer.js";

const enemyBars = createEntityBars({ healthWidth: 22, healthHeight: 3, healthBorderRadius: 1.5, stunHeight: 2, stunBorderRadius: 1 });

const enemySubclasses = new Map();

export class Enemy extends Actor {
    static healthBar = enemyBars.healthBar;
    static stunBar = enemyBars.stunBar;

    static registerSubclass(type, cls) {
        enemySubclasses.set(type, cls);
    }

    static spawn(x, y, enemyType, wave, baseUpgradeDefs) {
        const combatStats = buildEnemyCombatStats(enemyType);
        const reward = computeSpawnReward(wave, enemyType);
        const Cls = enemySubclasses.get(enemyType.type) || Enemy;
        const enemy = new Cls(x, y, enemyType, combatStats, baseUpgradeDefs, reward);
        const levels = computeEnemyUpgradeLevels();

        enemy.applySpawnUpgradeLevels(levels, baseUpgradeDefs);
        enemy.applyWeaponLoadout(rollEnemyStartLoadout());
        enemy.health = enemy.maxHealth;
        return enemy;
    }

    constructor(x, y, enemyType, combatStats, baseUpgradeDefs, reward) {
        super(x, y, enemyType.radius, combatStats.speed, combatStats.maxHealth, enemyType.color, enemyType.type, enemyType.accelRate ?? 3.0, enemyType.canDamageWalls ?? false);
        this.reward = reward;
        this.attackType = enemyType.attackType ?? "ranged";
        this.canDodge = enemyType.canDodge ?? false;
        this.enemyType = enemyType;
        this.setupCombatant(combatStats, baseUpgradeDefs);
        this.initCombatWeapon();
        this.isEngaged = false;
        this.isPassive = false;
        this.isIntroGuard = false;
        this.dodgeTimerId = null;
        this.dodgeTargetX = 0;
        this.dodgeTargetY = 0;
        this.chargeCooldown = 0;
        this.startingAbilities = [];
        this.healthBar = Enemy.healthBar;
        this.stunBar = Enemy.stunBar;
        this.usesKinematicsBody = true;
        this._kinematicsCamera = { x, y };
    }

    getKinematicsCamera(state) {
        const player = state?.player;
        return player ? { x: player.x, y: player.y } : { x: this.x, y: this.y };
    }

    onHitAfterDamage(damage, ctx, hitType, died, event) {
        if (died) emitCombatEnemyKilled(this);
        super.onHitAfterDamage(damage, ctx, hitType, died, event);
    }

    getAITarget(state) {
        if (this.isPassive) return null;
        return super.getAITarget(state);
    }

    handleHit(damage, ctx, hitType, event) {
        if (this.isPassive && this.isIntroGuard) return false;
        return super.handleHit(damage, ctx, hitType, event);
    }

    updateLocomotion(dt, state, spatialFrame, options = {}) {
        const target = this.getAITarget(state);

        if (!target) {
            this.desiredX = 0;
            this.desiredY = 0;
            this.applyLocomotion(dt, spatialFrame, { state, ignoreSeparationInDesired: true });
            return;
        }

        this.currentState.update(this, dt, target, state.flowFieldGrid, state.walls, state.projectiles, spatialFrame, state.scheduler, state);
    }

    calculateSteering(target, state) {
        state.navigation.steerTo(this, target.x, target.y, NAV_PROFILES.enemyToPlayer, null, state);
    }

    shouldTriggerDodge(projectiles, flowFieldGrid, scheduler) {
        for (const m of projectiles) {
            if (!areHostile(this, m)) continue;

            const dist = Math.hypot(m.x - this.x, m.y - this.y);
            if (dist < 100 && !m.isDead) {
                const angleToEnemy = Math.atan2(this.y - m.y, this.x - m.x);
                let angleDiff = angleToEnemy - m.angle;
                angleDiff = normalizeAngle(angleDiff);

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

    renderBody(ctx, _renderer) {
        renderActorKinematicsBody(ctx, this, this._kinematicsCamera ?? { x: this.x, y: this.y });
    }
}
