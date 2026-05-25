import { PhysicsSystem } from "./Spatial/PhysicsSystem.js";
import { Utilities } from "./Utilities.js";
import { CollisionSystem } from "./Spatial/CollisionSystem.js";

function analyzeStrafePath(enemy, tangentX, tangentY, dir, walls, target) {
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

        const hasLOS = Utilities.hasLineOfSight(tx, ty, target.x, target.y, walls, enemy.radius);
        if (!hasLOS && coverDist === -1) {
            coverDist = dist;
        }
        if (hasLOS && openDist === -1) {
            openDist = dist;
        }
    }

    return { walkableDist, coverDist, openDist };
}

export class EnemyNavigatingState {
    update(enemy, dt, target, gridSystem, walls, missiles, spatialHash, scheduler, state) {
        if (enemy.canDodge && scheduler.getTimeRemaining(enemy.dodgeTimerId) <= 0 && enemy.shouldTriggerDodge(missiles, gridSystem, scheduler)) {
            enemy.changeState("dodging");
            return enemy.currentState.update(enemy, dt, target, gridSystem, walls, missiles, spatialHash, scheduler, state);
        }

        if (enemy.attackType === "charge") {
            enemy.changeState("charging");
            return enemy.currentState.update(enemy, dt, target, gridSystem, walls, missiles, spatialHash, scheduler, state);
        }

        const distToTarget = Math.hypot(enemy.x - target.x, enemy.y - target.y);
        const hasLOS = Utilities.hasLineOfSight(enemy.x, enemy.y, target.x, target.y, walls, enemy.radius);
        if (distToTarget <= target.radius + enemy.attackRange && hasLOS) {
            enemy.changeState("engaged");
            return enemy.currentState.update(enemy, dt, target, gridSystem, walls, missiles, spatialHash, scheduler, state);
        }

        enemy.calculateSteering(target, gridSystem);
        enemy.separation.update(enemy, spatialHash);
        PhysicsSystem.applyMovement(enemy, dt, true, true);
        PhysicsSystem.resolveWallCollisions(enemy, walls, state);

        let diff = enemy.angle - enemy.turret.angle;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        enemy.turret.angle += diff * Math.min(1, enemy.turret.turnSpeed * (dt / 1000));

        return false;
    }
}

export class EnemyEngagedState {
    update(enemy, dt, target, gridSystem, walls, missiles, spatialHash, scheduler, state) {
        if (enemy.canDodge && scheduler.getTimeRemaining(enemy.dodgeTimerId) <= 0 && enemy.shouldTriggerDodge(missiles, gridSystem, scheduler)) {
            enemy.changeState("dodging");
            return enemy.currentState.update(enemy, dt, target, gridSystem, walls, missiles, spatialHash, scheduler, state);
        }

        const dx = enemy.x - target.x;
        const dy = enemy.y - target.y;
        const dist = Math.hypot(dx, dy);

        if (dist > target.radius + enemy.attackRange + 15) {
            enemy.changeState("navigating");
            return enemy.currentState.update(enemy, dt, target, gridSystem, walls, missiles, spatialHash, scheduler, state);
        }

        const shouldStrafe = (enemy.type === "fast" || enemy.type === "dodger");
        const hasLOS = Utilities.hasLineOfSight(enemy.x, enemy.y, target.x, target.y, walls, enemy.radius);

        const radialX = dx / dist;
        const radialY = dy / dist;
        const tangentX = -radialY;
        const tangentY = radialX;

        if (shouldStrafe) {
            if (!hasLOS) {
                enemy.changeState("navigating");
                return enemy.currentState.update(enemy, dt, target, gridSystem, walls, missiles, spatialHash, scheduler, state);
            }

            if (enemy.strafeDir === undefined) {
                enemy.strafeDir = Math.random() < 0.5 ? 1 : -1;
            }
            if (enemy.strafeTimerId === undefined || enemy.strafeTimerId === null) {
                enemy.strafeTimerId = scheduler.schedule(8000 + Math.random() * 8000);
            }

            const currentPath = analyzeStrafePath(enemy, tangentX, tangentY, enemy.strafeDir, walls, target);
            if (currentPath.walkableDist < 45) {
                const oppositePath = analyzeStrafePath(enemy, tangentX, tangentY, -enemy.strafeDir, walls, target);
                if (oppositePath.walkableDist > currentPath.walkableDist) {
                    enemy.strafeDir *= -1;
                    enemy.strafeTimerId = scheduler.schedule(8000 + Math.random() * 8000);
                }
            }

            if (scheduler.getTimeRemaining(enemy.strafeTimerId) <= 0) {
                const oppositePath = analyzeStrafePath(enemy, tangentX, tangentY, -enemy.strafeDir, walls, target);
                if (oppositePath.walkableDist > 50) {
                    enemy.strafeDir *= -1;
                }
                enemy.strafeTimerId = scheduler.schedule(8000 + Math.random() * 8000);
            }

            const preferredDist = target.radius + enemy.attackRange * 0.8;
            let radialFactor = 0;
            const distDiff = dist - preferredDist;
            if (Math.abs(distDiff) > 5) {
                radialFactor = Math.max(-0.3, Math.min(0.3, distDiff * 0.01));
            }

            enemy.desiredX = tangentX * enemy.strafeDir + radialX * radialFactor;
            enemy.desiredY = tangentY * enemy.strafeDir + radialY * radialFactor;
            
            enemy.separation.update(enemy, spatialHash);
            PhysicsSystem.applyMovement(enemy, dt, true, true, false);
            PhysicsSystem.resolveWallCollisions(enemy, walls, state);
        } else {
            if (enemy.linearStrafeState === undefined) {
                enemy.linearStrafeState = "idle";
            }
            if (enemy.linearStrafeTimerId === undefined || enemy.linearStrafeTimerId === null) {
                enemy.linearStrafeTimerId = scheduler.schedule(200 + Math.random() * 500);
            }

            if (scheduler.getTimeRemaining(enemy.linearStrafeTimerId) <= 0) {
                const leftPath = analyzeStrafePath(enemy, tangentX, tangentY, 1, walls, target);
                const rightPath = analyzeStrafePath(enemy, tangentX, tangentY, -1, walls, target);

                if (hasLOS) {
                    const hasLeftCover = leftPath.coverDist !== -1 && leftPath.coverDist <= leftPath.walkableDist;
                    const hasRightCover = rightPath.coverDist !== -1 && rightPath.coverDist <= rightPath.walkableDist;

                    if ((hasLeftCover || hasRightCover) && Math.random() < 0.7) {
                        enemy.linearStrafeState = "strafing";
                        if (hasLeftCover && hasRightCover) {
                            enemy.strafeDir = leftPath.coverDist < rightPath.coverDist ? 1 : -1;
                        } else {
                            enemy.strafeDir = hasLeftCover ? 1 : -1;
                        }
                        const targetDist = enemy.strafeDir === 1 ? leftPath.coverDist : rightPath.coverDist;
                        enemy.linearStrafeTimerId = scheduler.schedule((targetDist / enemy.speed) * 1000 + 300);
                    } else {
                        if (Math.random() < 0.7) {
                            enemy.linearStrafeState = "strafing";
                            enemy.strafeDir = leftPath.walkableDist >= rightPath.walkableDist ? 1 : -1;
                            const walkTarget = enemy.strafeDir === 1 ? leftPath.walkableDist : rightPath.walkableDist;
                            const strafeDist = Math.min(walkTarget, 30 + Math.random() * 40);
                            enemy.linearStrafeTimerId = scheduler.schedule((strafeDist / enemy.speed) * 1000);
                        } else {
                            enemy.linearStrafeState = "idle";
                            enemy.linearStrafeTimerId = scheduler.schedule(400 + Math.random() * 800);
                        }
                    }
                } else {
                    const hasLeftOpen = leftPath.openDist !== -1 && leftPath.openDist <= leftPath.walkableDist;
                    const hasRightOpen = rightPath.openDist !== -1 && rightPath.openDist <= rightPath.walkableDist;

                    if (hasLeftOpen || hasRightOpen) {
                        enemy.linearStrafeState = "strafing";
                        if (hasLeftOpen && hasRightOpen) {
                            enemy.strafeDir = leftPath.openDist < rightPath.openDist ? 1 : -1;
                        } else {
                            enemy.strafeDir = hasLeftOpen ? 1 : -1;
                        }
                        const targetDist = enemy.strafeDir === 1 ? leftPath.openDist : rightPath.openDist;
                        enemy.linearStrafeTimerId = scheduler.schedule((targetDist / enemy.speed) * 1000 + 300);
                    } else {
                        enemy.changeState("navigating");
                        return enemy.currentState.update(enemy, dt, target, gridSystem, walls, missiles, spatialHash, scheduler, state);
                    }
                }
            }

            if (enemy.linearStrafeState === "strafing") {
                enemy.desiredX = tangentX * enemy.strafeDir;
                enemy.desiredY = tangentY * enemy.strafeDir;
            } else {
                enemy.desiredX = 0;
                enemy.desiredY = 0;
            }

            enemy.separation.update(enemy, spatialHash);
            PhysicsSystem.applyMovement(enemy, dt, false, true, false);
            
            const hitWall = PhysicsSystem.resolveWallCollisions(enemy, walls, state);
            if (hitWall) {
                enemy.strafeDir *= -1;
                enemy.linearStrafeState = "idle";
                enemy.linearStrafeTimerId = scheduler.schedule(1000 + Math.random() * 1000);
            }
        }

        const angleToTarget = Math.atan2(-dy, -dx);
        let angleDiff = angleToTarget - enemy.angle;
        angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
        enemy.angle += angleDiff * Math.min(1, enemy.turnSpeed * (dt / 1000));

        enemy.weaponMode.processTurret(dt, state, enemy, enemy.fireRate, enemy.turret, target, !hasLOS, null);

        return false;
    }
}

export class EnemyChargingState {
    update(enemy, dt, target, gridSystem, walls, missiles, spatialHash, scheduler, state) {
        const distToTarget = Math.hypot(enemy.x - target.x, enemy.y - target.y);
        enemy.isEngaged = distToTarget <= target.radius + enemy.attackRange;

        enemy.calculateSteering(target, gridSystem);
        enemy.separation.update(enemy, spatialHash);
        PhysicsSystem.applyMovement(enemy, dt, true, true);
        PhysicsSystem.resolveWallCollisions(enemy, walls, state);

        let diff = enemy.angle - enemy.turret.angle;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        enemy.turret.angle += diff * Math.min(1, enemy.turret.turnSpeed * (dt / 1000));

        return false;
    }
}

export class EnemyDodgingState {
    update(enemy, dt, target, gridSystem, walls, missiles, spatialHash, scheduler, state) {
        const dx = enemy.dodgeTargetX - enemy.x;
        const dy = enemy.dodgeTargetY - enemy.y;
        const dist = Math.hypot(dx, dy);
        const moveDist = enemy.speed * 1.5 * (dt / 1000);

        const targetAngle = Math.atan2(dy, dx);
        let dodgeAngleDiff = targetAngle - enemy.angle;
        dodgeAngleDiff = Math.atan2(Math.sin(dodgeAngleDiff), Math.cos(dodgeAngleDiff));
        enemy.angle += dodgeAngleDiff * Math.min(1, enemy.turnSpeed * 1.5 * (dt / 1000));

        if (dist <= moveDist) {
            enemy.x = enemy.dodgeTargetX;
            enemy.y = enemy.dodgeTargetY;
            enemy.changeState("navigating");
        } else {
            enemy.x += (dx / dist) * moveDist;
            enemy.y += (dy / dist) * moveDist;
        }

        let diff = enemy.angle - enemy.turret.angle;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        enemy.turret.angle += diff * Math.min(1, enemy.turret.turnSpeed * (dt / 1000));

        return false;
    }
}

export const enemyStates = {
    navigating: new EnemyNavigatingState(),
    engaged: new EnemyEngagedState(),
    charging: new EnemyChargingState(),
    dodging: new EnemyDodgingState()
};