import { normalizeAngle, turnAngleTowards } from "../Math/Angle.js";
import { areHostile } from "../Combat/Targeting.js";
import { Actor } from "./Actor.js";
import { emitCombatEnemyKilled } from "../Core/EventSystem.js";
import { NAV_PROFILES } from "../Config/Config.js";
import { rollEnemyStartLoadout } from "../Combat/weaponLoadout.js";
import { createEntityBars } from "./EntityBars.js";
import { buildEnemyCombatStats, computeEnemyUpgradeLevels, computeSpawnReward } from "../Combat/EnemySpawn.js";
import { renderActorKinematicsBody } from "../Render/Kinematics/PlayerKinematicsRenderer.js";
import { EnemyBrain } from "./EnemyBrain.js";
import { PatrolController } from "./EnemyPatrolStates.js";
import { CombatController } from "./EnemyCombatBehaviors.js";

const enemyBars = createEntityBars({ healthWidth: 22, healthHeight: 3, healthBorderRadius: 1.5, stunHeight: 2, stunBorderRadius: 1 });

export class Enemy extends Actor {
    static healthBar = enemyBars.healthBar;
    static stunBar = enemyBars.stunBar;

    static spawn(x, y, enemyType, wave, baseUpgradeDefs) {
        const combatStats = buildEnemyCombatStats(enemyType);
        const reward = computeSpawnReward(wave, enemyType);
        const enemy = new Enemy(x, y, enemyType, combatStats, baseUpgradeDefs, reward);
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
        
        this.brain = new EnemyBrain(this);
        this.patrolData = {};
        this.patrolController = new PatrolController(this);
        this.combatData = {};
        this.combatController = new CombatController(this);
        this.lastScheduler = null;
        this.lastGameState = null;
        this.patrolTargetX = null;
        this.patrolTargetY = null;
        this.changeState("enemyPatrol");
    }

    syncPatrolAwareness(state) {
        if (this.isPassive || state.startNodeIntroActive) return;

        const alertState = state.alertState;
        if (!alertState?.isChaseActive(state)) return;

        const patrol = this.patrolController;
        if (patrol.state === "chase" || patrol.state === "alert") return;

        const lx = alertState.lastKnownTargetX;
        const ly = alertState.lastKnownTargetY;
        if (lx == null || ly == null) return;

        const dx = this.x - lx;
        const dy = this.y - ly;
        const joinDist = 20 * 16;
        if (dx * dx + dy * dy < joinDist * joinDist) {
            patrol.transitionTo("chase");
        }
    }

    getKinematicsCamera(state) {
        const player = state?.player;
        return player ? { x: player.x, y: player.y } : { x: this.x, y: this.y };
    }

    onHitAfterDamage(damage, ctx, hitType, died, event) {
        if (died) emitCombatEnemyKilled(this);
        super.onHitAfterDamage(damage, ctx, hitType, died, event);
    }

    canRunTurretCombat() {
        if (this.isPassive || !this.weapon || this.turrets.length === 0) return false;
        if (this.currentStateName === "stunned" || this.currentStateName === "knockedBack") return false;

        const patrolState = this.patrolController?.state;
        if (patrolState === "chase") return true;
        if (patrolState === "alert" || patrolState === "casual" || patrolState === "search") return false;

        return super.canRunTurretCombat();
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
        this.lastScheduler = state.scheduler;
        this.lastGameState = state;
        
        // If we are in a custom movement state like knockedBack or stunned from ActorStates
        if (this.currentState?.customMovement || this.currentStateName === "stunned" || this.currentStateName === "knockedBack") {
            this.currentState.update(this, dt, null, state.flowFieldGrid, state.walls, state.projectiles, spatialFrame, state.scheduler, state);
            return;
        }

        if (!this.isPassive) {
            this.brain.processVision(state);
            this.syncPatrolAwareness(state);
        }
        
        this.patrolController.update(dt, state, spatialFrame);
        
        // Apply locomotion
        this.applyLocomotion(dt, spatialFrame, { state, ignoreSeparationInDesired: false });
        
        // Rotate towards movement or look target
        let lookX = 0;
        let lookY = 0;
        let hasLookTarget = false;
        
        if (this.brain.lookTargetX !== null && this.brain.lookTargetY !== null) {
            lookX = this.brain.lookTargetX - this.x;
            lookY = this.brain.lookTargetY - this.y;
            hasLookTarget = true;
        } else if (this.brain.personalTarget) {
            lookX = this.brain.personalTarget.x - this.x;
            lookY = this.brain.personalTarget.y - this.y;
            hasLookTarget = true;
        } else if (Math.abs(this.vx) > 0.1 || Math.abs(this.vy) > 0.1) {
            lookX = this.vx;
            lookY = this.vy;
            hasLookTarget = true;
        }
        
        if (hasLookTarget && (lookX * lookX + lookY * lookY > 0.01)) {
            const targetAngle = Math.atan2(lookY, lookX);
            this.angle = turnAngleTowards(this.angle, targetAngle, this.turnSpeed, dt);
        }
    }

    calculateSteering(target, state) {
        state.navigation.steerTo(this, target.x, target.y, NAV_PROFILES.enemyToPlayer);
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
