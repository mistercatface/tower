import { PhysicsSystem } from "../Spatial/Motion/PhysicsSystem.js";
import { GhostTrail } from "../Render/GhostTrail.js";
import { normalizeAngle, turnAngleTowards } from "../Math/Angle.js";
import { Utilities } from "../Core/Utilities.js";
import { CollisionSystem } from "../Spatial/Collision/CollisionSystem.js";

function analyzeStrafePath(enemy, tangentX, tangentY, dir, walls, target, state) {
    const stepSize = 10;
    const maxSteps = 12;
    let walkableDist = 0;
    let coverDist = -1;
    let openDist = -1;

    for (let step = 1; step <= maxSteps; step++) {
        const dist = step * stepSize;
        const tx = enemy.x + tangentX * dir * dist;
        const ty = enemy.y + tangentY * dir * dist;

        let hitWall = false;
        const testCircle = { x: tx, y: ty, radius: enemy.radius };
        for (const seg of walls) {
            if (seg.isDead) continue;
            if (CollisionSystem.checkCircleRect(testCircle, seg)) {
                hitWall = true;
                break;
            }
        }
        if (hitWall) {
            break;
        }

        walkableDist = dist;

        const hasLOS = target.hasLineOfSightFromPoint(tx, ty, state, { sourceRadius: enemy.radius });
        if (!hasLOS && coverDist === -1) {
            coverDist = dist;
        }
        if (hasLOS && openDist === -1) {
            openDist = dist;
        }
    }

    return { walkableDist, coverDist, openDist };
}

function cancelEngagedStrafeTimers(enemy) {
    const scheduler = enemy.lastScheduler;
    const data = enemy.stateData;
    if (!scheduler || !data) return;
    if (data.strafeTimerId != null) scheduler.cancel(data.strafeTimerId);
    if (data.linearStrafeTimerId != null) scheduler.cancel(data.linearStrafeTimerId);
}

export class EnemyNavigatingState {
    onEnter(enemy) {
        enemy.isEngaged = false;
    }

    update(enemy, dt, target, flowFieldGrid, walls, missiles, spatialFrame, scheduler, state) {
        if (enemy.canDodge && scheduler.getTimeRemaining(enemy.dodgeTimerId) <= 0 && enemy.shouldTriggerDodge(missiles, flowFieldGrid, scheduler)) {
            return enemy.changeStateAndUpdate("dodging", { targetX: enemy.dodgeTargetX, targetY: enemy.dodgeTargetY }, dt, target, flowFieldGrid, walls, missiles, spatialFrame, scheduler, state);
        }

        if (enemy.attackType === "charge") {
            return enemy.changeStateAndUpdate("charging_prepare", null, dt, target, flowFieldGrid, walls, missiles, spatialFrame, scheduler, state);
        }

        const distToTarget = Math.hypot(enemy.x - target.x, enemy.y - target.y);
        const hasLOS = enemy.hasLineOfSightTo(target, state);
        if (distToTarget <= target.radius + enemy.weapon.range && hasLOS) {
            return enemy.changeStateAndUpdate("engaged", null, dt, target, flowFieldGrid, walls, missiles, spatialFrame, scheduler, state);
        }

        enemy.calculateSteering(target, state);
        enemy.applyLocomotion(dt, spatialFrame, { state, ignoreSeparationInDesired: true });

        return false;
    }
}

export class EnemyEngagedState {
    constructor() {
        this.runsTurretCombat = true;
    }

    onExit(enemy) {
        cancelEngagedStrafeTimers(enemy);
    }

    getTurretBlocksTargeting(enemy, state) {
        const target = enemy.getAITarget(state);
        if (!target) return true;
        return enemy.blocksTurretLineOfSight(target, state);
    }

    update(enemy, dt, target, flowFieldGrid, walls, missiles, spatialFrame, scheduler, state) {
        enemy.lastScheduler = scheduler;

        if (enemy.canDodge && scheduler.getTimeRemaining(enemy.dodgeTimerId) <= 0 && enemy.shouldTriggerDodge(missiles, flowFieldGrid, scheduler)) {
            return enemy.changeStateAndUpdate("dodging", { targetX: enemy.dodgeTargetX, targetY: enemy.dodgeTargetY }, dt, target, flowFieldGrid, walls, missiles, spatialFrame, scheduler, state);
        }

        const dx = enemy.x - target.x;
        const dy = enemy.y - target.y;
        const dist = Math.hypot(dx, dy);

        if (dist > target.radius + enemy.weapon.range + 15) {
            return enemy.changeStateAndUpdate("navigating", null, dt, target, flowFieldGrid, walls, missiles, spatialFrame, scheduler, state);
        }

        const shouldStrafe = (enemy.type === "fast" || enemy.type === "dodger");
        const hasLOS = enemy.hasLineOfSightTo(target, state);

        const radialX = dx / dist;
        const radialY = dy / dist;
        const tangentX = -radialY;
        const tangentY = radialX;

        const stateData = enemy.stateData;

        if (shouldStrafe) {
            if (!hasLOS) {
                return enemy.changeStateAndUpdate("navigating", null, dt, target, flowFieldGrid, walls, missiles, spatialFrame, scheduler, state);
            }

            if (stateData.strafeDir === undefined) {
                stateData.strafeDir = Math.random() < 0.5 ? 1 : -1;
            }
            if (stateData.strafeTimerId === undefined || stateData.strafeTimerId === null) {
                stateData.strafeTimerId = scheduler.schedule(8000 + Math.random() * 8000);
            }

            const currentPath = analyzeStrafePath(enemy, tangentX, tangentY, stateData.strafeDir, walls, target, state);
            if (currentPath.walkableDist < 45) {
                const oppositePath = analyzeStrafePath(enemy, tangentX, tangentY, -stateData.strafeDir, walls, target, state);
                if (oppositePath.walkableDist > currentPath.walkableDist) {
                    stateData.strafeDir *= -1;
                    stateData.strafeTimerId = scheduler.schedule(8000 + Math.random() * 8000);
                }
            }

            if (scheduler.getTimeRemaining(stateData.strafeTimerId) <= 0) {
                const oppositePath = analyzeStrafePath(enemy, tangentX, tangentY, -stateData.strafeDir, walls, target, state);
                if (oppositePath.walkableDist > 50) {
                    stateData.strafeDir *= -1;
                }
                stateData.strafeTimerId = scheduler.schedule(8000 + Math.random() * 8000);
            }

            const preferredDist = target.radius + enemy.weapon.range * 0.8;
            let radialFactor = 0;
            const distDiff = dist - preferredDist;
            if (Math.abs(distDiff) > 5) {
                radialFactor = Math.max(-0.3, Math.min(0.3, distDiff * 0.01));
            }

            enemy.desiredX = tangentX * stateData.strafeDir + radialX * radialFactor;
            enemy.desiredY = tangentY * stateData.strafeDir + radialY * radialFactor;

            enemy.separation.update(enemy, spatialFrame);
            PhysicsSystem.applyMovement(enemy, dt, true, true, false);
            PhysicsSystem.resolveWallCollisions(enemy, spatialFrame, state);
        } else {
            if (stateData.linearStrafeState === undefined) {
                stateData.linearStrafeState = "idle";
            }
            if (stateData.linearStrafeTimerId === undefined || stateData.linearStrafeTimerId === null) {
                stateData.linearStrafeTimerId = scheduler.schedule(200 + Math.random() * 500);
            }

            if (scheduler.getTimeRemaining(stateData.linearStrafeTimerId) <= 0) {
                const leftPath = analyzeStrafePath(enemy, tangentX, tangentY, 1, walls, target, state);
                const rightPath = analyzeStrafePath(enemy, tangentX, tangentY, -1, walls, target, state);

                if (hasLOS) {
                    const hasLeftCover = leftPath.coverDist !== -1 && leftPath.coverDist <= leftPath.walkableDist;
                    const hasRightCover = rightPath.coverDist !== -1 && rightPath.coverDist <= rightPath.walkableDist;

                    if ((hasLeftCover || hasRightCover) && Math.random() < 0.7) {
                        stateData.linearStrafeState = "strafing";
                        if (hasLeftCover && hasRightCover) {
                            stateData.strafeDir = leftPath.coverDist < rightPath.coverDist ? 1 : -1;
                        } else {
                            stateData.strafeDir = hasLeftCover ? 1 : -1;
                        }
                        const targetDist = stateData.strafeDir === 1 ? leftPath.coverDist : rightPath.coverDist;
                        stateData.linearStrafeTimerId = scheduler.schedule((targetDist / enemy.speed) * 1000 + 300);
                    } else {
                        if (Math.random() < 0.7) {
                            stateData.linearStrafeState = "strafing";
                            stateData.strafeDir = leftPath.walkableDist >= rightPath.walkableDist ? 1 : -1;
                            const walkTarget = stateData.strafeDir === 1 ? leftPath.walkableDist : rightPath.walkableDist;
                            const strafeDist = Math.min(walkTarget, 30 + Math.random() * 40);
                            stateData.linearStrafeTimerId = scheduler.schedule((strafeDist / enemy.speed) * 1000);
                        } else {
                            stateData.linearStrafeState = "idle";
                            stateData.linearStrafeTimerId = scheduler.schedule(400 + Math.random() * 800);
                        }
                    }
                } else {
                    const hasLeftOpen = leftPath.openDist !== -1 && leftPath.openDist <= leftPath.walkableDist;
                    const hasRightOpen = rightPath.openDist !== -1 && rightPath.openDist <= rightPath.walkableDist;

                    if (hasLeftOpen || hasRightOpen) {
                        stateData.linearStrafeState = "strafing";
                        if (hasLeftOpen && hasRightOpen) {
                            stateData.strafeDir = leftPath.openDist < rightPath.openDist ? 1 : -1;
                        } else {
                            stateData.strafeDir = hasLeftOpen ? 1 : -1;
                        }
                        const targetDist = stateData.strafeDir === 1 ? leftPath.openDist : rightPath.openDist;
                        stateData.linearStrafeTimerId = scheduler.schedule((targetDist / enemy.speed) * 1000 + 300);
                    } else {
                        return enemy.changeStateAndUpdate("navigating", null, dt, target, flowFieldGrid, walls, missiles, spatialFrame, scheduler, state);
                    }
                }
            }

            if (stateData.linearStrafeState === "strafing") {
                enemy.desiredX = tangentX * stateData.strafeDir;
                enemy.desiredY = tangentY * stateData.strafeDir;
            } else {
                enemy.desiredX = 0;
                enemy.desiredY = 0;
            }

            enemy.separation.update(enemy, spatialFrame);
            PhysicsSystem.applyMovement(enemy, dt, false, true, false);

            const hitWall = PhysicsSystem.resolveWallCollisions(enemy, spatialFrame, state);
            if (hitWall) {
                stateData.strafeDir *= -1;
                stateData.linearStrafeState = "idle";
                stateData.linearStrafeTimerId = scheduler.schedule(1000 + Math.random() * 1000);
            }
        }

        const angleToTarget = Math.atan2(-dy, -dx);
        enemy.angle = turnAngleTowards(enemy.angle, angleToTarget, enemy.turnSpeed, dt);

        return false;
    }
}

export class EnemyChargePrepareState {
    update(enemy, dt, target, flowFieldGrid, walls, missiles, spatialFrame, scheduler, state) {
        if (enemy.chargeCooldown > 0) {
            enemy.chargeCooldown -= dt;
        }

        const distToTarget = Math.hypot(enemy.x - target.x, enemy.y - target.y);
        enemy.isEngaged = distToTarget <= target.radius + enemy.weapon.range;

        const stagingDist = 125;
        
        if (distToTarget > stagingDist + 25) {
            enemy.calculateSteering(target, state);
        } else if (distToTarget < stagingDist - 20) {
            const dx = enemy.x - target.x;
            const dy = enemy.y - target.y;
            Utilities.setDesiredDirection(enemy, dx, dy);
        } else {
            enemy.desiredX = 0;
            enemy.desiredY = 0;
        }

        enemy.separation.update(enemy, spatialFrame);
        PhysicsSystem.applyMovement(enemy, dt, false, true);
        PhysicsSystem.resolveWallCollisions(enemy, spatialFrame, state);

        const isStable = Math.hypot(enemy.vx, enemy.vy) < enemy.speed * 0.6;
        
        if (enemy.chargeCooldown <= 0 && distToTarget < 220 && distToTarget > 80 && isStable) {
            return enemy.changeStateAndUpdate("charging_windup", {
                timer: 1000,
            }, dt, target, flowFieldGrid, walls, missiles, spatialFrame, scheduler, state);
        }

        return false;
    }
}

export class EnemyChargeWindupState {
    onEnter(enemy) {
        enemy.vx = 0;
        enemy.vy = 0;
    }

    getAimTarget(enemy, target) {
        if (target) return target;
        return {
            x: enemy.x + Math.cos(enemy.angle) * 100,
            y: enemy.y + Math.sin(enemy.angle) * 100,
        };
    }

    update(enemy, dt, target, flowFieldGrid, walls, missiles, spatialFrame, scheduler, state) {
        enemy.desiredX = 0;
        enemy.desiredY = 0;
        PhysicsSystem.applyMovement(enemy, dt, true, true);
        PhysicsSystem.resolveWallCollisions(enemy, spatialFrame, state);

        const dx = target.x - enemy.x;
        const dy = target.y - enemy.y;
        const angleToTarget = Math.atan2(dy, dx);
        enemy.angle = turnAngleTowards(enemy.angle, angleToTarget, enemy.turnSpeed * 1.5, dt);

        const stateData = enemy.stateData;
        stateData.timer -= dt;
        if (stateData.timer <= 0) {
            return enemy.changeStateAndUpdate("charging_dash", {
                timer: 1200,
            }, dt, target, flowFieldGrid, walls, missiles, spatialFrame, scheduler, state);
        }

        return false;
    }
}

export class EnemyChargeDashState {
    onEnter(enemy) {
    }

    onExit(enemy) {
        enemy.desiredX = 0;
        enemy.desiredY = 0;
    }

    update(enemy, dt, target, flowFieldGrid, walls, missiles, spatialFrame, scheduler, state) {
        const stateData = enemy.stateData;

        enemy.calculateSteering(target, state);

        const originalSpeed = enemy.speed;
        enemy.speed = originalSpeed * 2.2;
        const originalAccel = enemy.accelRate;
        enemy.accelRate = originalAccel * 5.0;

        PhysicsSystem.applyMovement(enemy, dt, true, true);

        enemy.speed = originalSpeed;
        enemy.accelRate = originalAccel;

        PhysicsSystem.resolveWallCollisions(enemy, spatialFrame, state);

        const distToTarget = Math.hypot(enemy.x - target.x, enemy.y - target.y);
        stateData.timer -= dt;

        if (stateData.timer <= 0 || distToTarget <= target.radius + enemy.radius) {
            enemy.chargeCooldown = 1500;
            enemy.changeState("charging_prepare");
        }

        return false;
    }
}

export class EnemyDodgingState {
    update(enemy, dt, target, flowFieldGrid, walls, missiles, spatialFrame, scheduler, state) {
        const stateData = enemy.stateData;
        const dx = stateData.targetX - enemy.x;
        const dy = stateData.targetY - enemy.y;
        const dist = Math.hypot(dx, dy);
        const moveDist = enemy.speed * 1.5 * (dt / 1000);

        const targetAngle = Math.atan2(dy, dx);
        enemy.angle = turnAngleTowards(enemy.angle, targetAngle, enemy.turnSpeed * 1.5, dt);

        if (dist > 0.001) {
            enemy.desiredX = dx / dist;
            enemy.desiredY = dy / dist;
        }

        if (dist <= moveDist) {
            enemy.x = stateData.targetX;
            enemy.y = stateData.targetY;
            enemy.changeState("navigating");
        } else {
            enemy.x += (dx / dist) * moveDist;
            enemy.y += (dy / dist) * moveDist;
        }

        return false;
    }
}

export class EnemyStunnedState {
    onEnter(enemy) {
        if (enemy.stateData.timer == null) enemy.stateData.timer = 1000;
        if (enemy.stateData.stunDurationMs == null) {
            enemy.stateData.stunDurationMs = enemy.stateData.timer;
        }
        if (!enemy.stateData.returnState) {
            enemy.stateData.returnState = enemy.attackType === "charge" ? "charging_prepare" : "navigating";
        }
    }

    getStunBarProgress(enemy) {
        const data = enemy.stateData;
        const total = data.stunDurationMs;
        if (!total || total <= 0) return null;
        return Math.max(0, Math.min(1, data.timer / total));
    }

    update(enemy, dt, target, flowFieldGrid, walls, missiles, spatialFrame, scheduler, state) {
        enemy.desiredX = 0;
        enemy.desiredY = 0;

        enemy.separation.update(enemy, spatialFrame);
        PhysicsSystem.applyFrictionAndDrag(enemy, dt, 4.0);
        enemy.x += enemy.separation.pushX;
        enemy.y += enemy.separation.pushY;
        PhysicsSystem.resolveWallCollisions(enemy, spatialFrame, state);

        const velLen = Math.hypot(enemy.vx, enemy.vy);
        if (velLen > 1) {
            const targetAngle = Math.atan2(enemy.vy, enemy.vx);
            enemy.angle = turnAngleTowards(enemy.angle, targetAngle, enemy.turnSpeed, dt);
        }

        enemy.stateData.timer -= dt;
        if (enemy.stateData.timer <= 0) {
            if (enemy.attackType === "charge") {
                enemy.chargeCooldown = 1500;
            }
            enemy.vx = 0;
            enemy.vy = 0;
            enemy.changeState(enemy.stateData.returnState);
        }

        return false;
    }
}

export class EnemyKnockedBackState {
    constructor() {
        this.customMovement = true;
        this.blocksTargeting = true;
        this.blocksInput = true;
        this.locksTurretAim = true;
    }

    onEnter(enemy) {
        const data = enemy.stateData;
        if (data.pushMs == null) data.pushMs = 500;
        if (data.stunMs == null) data.stunMs = data.pushMs;
        if (data.pushSpeedMultiplier == null) data.pushSpeedMultiplier = 3;
        if (data.angle == null) data.angle = enemy.angle;
        if (!data.returnState) {
            data.returnState = enemy.attackType === "charge" ? "charging_prepare" : "navigating";
        }
        data.phase = "push";
        data.timer = data.pushMs;

        for (const turret of enemy.getTurrets()) {
            enemy.clearTurretCharge(turret);
            turret.target = null;
        }
    }

    onExit(enemy) {
        enemy.vx = 0;
        enemy.vy = 0;
    }

    resolveTurretAimAngle(enemy) {
        const data = enemy.stateData;
        if (data.phase === "recovery") {
            const velLen = Math.hypot(enemy.vx, enemy.vy);
            if (velLen > 1) {
                return Math.atan2(enemy.vy, enemy.vx);
            }
        }
        return data.angle;
    }

    getAimTarget(enemy, target, blocksTargeting, turret) {
        const angle = this.resolveTurretAimAngle(enemy);
        return {
            x: enemy.x + Math.cos(angle) * 100,
            y: enemy.y + Math.sin(angle) * 100,
        };
    }

    getStunBarProgress(enemy) {
        const data = enemy.stateData;
        if (!data.stunMs || data.stunMs <= 0) return null;

        let remaining = data.timer;
        if (data.phase === "push") {
            remaining += Math.max(0, data.stunMs - data.pushMs);
        }

        return Math.max(0, Math.min(1, remaining / data.stunMs));
    }

    finish(enemy) {
        if (enemy.attackType === "charge") {
            enemy.chargeCooldown = 1500;
        }
        enemy.vx = 0;
        enemy.vy = 0;
        enemy.changeState(enemy.stateData.returnState);
    }

    update(enemy, dt, target, flowFieldGrid, walls, missiles, spatialFrame, scheduler, state) {
        const data = enemy.stateData;
        data.timer -= dt;

        if (data.phase === "push") {
            const ratio = Math.max(0, data.timer / data.pushMs);
            const speed = enemy.speed * data.pushSpeedMultiplier * Math.pow(ratio, 1.5);
            enemy.vx = Math.cos(data.angle) * speed;
            enemy.vy = Math.sin(data.angle) * speed;
            enemy.x += enemy.vx * (dt / 1000);
            enemy.y += enemy.vy * (dt / 1000);
            enemy.angle = turnAngleTowards(enemy.angle, data.angle, enemy.turnSpeed, dt);
            PhysicsSystem.resolveWallCollisions(enemy, spatialFrame, state);

            if (data.timer <= 0) {
                const recoveryMs = data.stunMs - data.pushMs;
                if (recoveryMs <= 0) {
                    this.finish(enemy);
                    return false;
                }
                data.phase = "recovery";
                data.timer = recoveryMs;
            }
            return false;
        }

        enemy.desiredX = 0;
        enemy.desiredY = 0;
        enemy.separation.update(enemy, spatialFrame);
        PhysicsSystem.applyFrictionAndDrag(enemy, dt, 4.0);
        enemy.x += enemy.separation.pushX;
        enemy.y += enemy.separation.pushY;
        PhysicsSystem.resolveWallCollisions(enemy, spatialFrame, state);

        const velLen = Math.hypot(enemy.vx, enemy.vy);
        if (velLen > 1) {
            const targetAngle = Math.atan2(enemy.vy, enemy.vx);
            enemy.angle = turnAngleTowards(enemy.angle, targetAngle, enemy.turnSpeed, dt);
        }

        if (data.timer <= 0) {
            this.finish(enemy);
        }

        return false;
    }
}

export const actorStates = {
    navigating: new EnemyNavigatingState(),
    engaged: new EnemyEngagedState(),
    charging_prepare: new EnemyChargePrepareState(),
    charging_windup: new EnemyChargeWindupState(),
    charging_dash: new EnemyChargeDashState(),
    dodging: new EnemyDodgingState(),
    stunned: new EnemyStunnedState(),
    knockedBack: new EnemyKnockedBackState(),
};
