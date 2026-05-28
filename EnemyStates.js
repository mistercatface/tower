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
    update(enemy, dt, target, flowFieldGrid, walls, missiles, spatialHash, scheduler, state) {
        if (enemy.canDodge && scheduler.getTimeRemaining(enemy.dodgeTimerId) <= 0 && enemy.shouldTriggerDodge(missiles, flowFieldGrid, scheduler)) {
            enemy.changeState("dodging", { targetX: enemy.dodgeTargetX, targetY: enemy.dodgeTargetY });
            return enemy.currentState.update(enemy, dt, target, flowFieldGrid, walls, missiles, spatialHash, scheduler, state);
        }

        if (enemy.attackType === "charge") {
            enemy.changeState("charging_prepare");
            return enemy.currentState.update(enemy, dt, target, flowFieldGrid, walls, missiles, spatialHash, scheduler, state);
        }

        const distToTarget = Math.hypot(enemy.x - target.x, enemy.y - target.y);
        const hasLOS = Utilities.hasLineOfSight(enemy.x, enemy.y, target.x, target.y, walls, enemy.radius);
        if (distToTarget <= target.radius + enemy.weapon.range && hasLOS) {
            enemy.changeState("engaged");
            return enemy.currentState.update(enemy, dt, target, flowFieldGrid, walls, missiles, spatialHash, scheduler, state);
        }

        enemy.calculateSteering(target, state);
        enemy.applyLocomotion(dt, walls, spatialHash, { state, ignoreSeparationInDesired: true });

        if (enemy.turret) {
            enemy.turret.angle = Utilities.turnAngleTowards(enemy.turret.angle, enemy.angle, enemy.turret.turnSpeed, dt);
        }

        return false;
    }
}

export class EnemyEngagedState {
    update(enemy, dt, target, flowFieldGrid, walls, missiles, spatialHash, scheduler, state) {
        if (enemy.canDodge && scheduler.getTimeRemaining(enemy.dodgeTimerId) <= 0 && enemy.shouldTriggerDodge(missiles, flowFieldGrid, scheduler)) {
            enemy.changeState("dodging", { targetX: enemy.dodgeTargetX, targetY: enemy.dodgeTargetY });
            return enemy.currentState.update(enemy, dt, target, flowFieldGrid, walls, missiles, spatialHash, scheduler, state);
        }

        const dx = enemy.x - target.x;
        const dy = enemy.y - target.y;
        const dist = Math.hypot(dx, dy);

        if (dist > target.radius + enemy.weapon.range + 15) {
            enemy.changeState("navigating");
            return enemy.currentState.update(enemy, dt, target, flowFieldGrid, walls, missiles, spatialHash, scheduler, state);
        }

        const shouldStrafe = (enemy.type === "fast" || enemy.type === "dodger");
        const hasLOS = Utilities.hasLineOfSight(enemy.x, enemy.y, target.x, target.y, walls, enemy.radius);

        const radialX = dx / dist;
        const radialY = dy / dist;
        const tangentX = -radialY;
        const tangentY = radialX;

        const stateData = enemy.stateData;

        if (shouldStrafe) {
            if (!hasLOS) {
                enemy.changeState("navigating");
                return enemy.currentState.update(enemy, dt, target, flowFieldGrid, walls, missiles, spatialHash, scheduler, state);
            }

            if (stateData.strafeDir === undefined) {
                stateData.strafeDir = Math.random() < 0.5 ? 1 : -1;
            }
            if (stateData.strafeTimerId === undefined || stateData.strafeTimerId === null) {
                stateData.strafeTimerId = scheduler.schedule(8000 + Math.random() * 8000);
            }

            const currentPath = analyzeStrafePath(enemy, tangentX, tangentY, stateData.strafeDir, walls, target);
            if (currentPath.walkableDist < 45) {
                const oppositePath = analyzeStrafePath(enemy, tangentX, tangentY, -stateData.strafeDir, walls, target);
                if (oppositePath.walkableDist > currentPath.walkableDist) {
                    stateData.strafeDir *= -1;
                    stateData.strafeTimerId = scheduler.schedule(8000 + Math.random() * 8000);
                }
            }

            if (scheduler.getTimeRemaining(stateData.strafeTimerId) <= 0) {
                const oppositePath = analyzeStrafePath(enemy, tangentX, tangentY, -stateData.strafeDir, walls, target);
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

            enemy.separation.update(enemy, spatialHash);
            PhysicsSystem.applyMovement(enemy, dt, true, true, false);
            PhysicsSystem.resolveWallCollisions(enemy, walls, state);
        } else {
            if (stateData.linearStrafeState === undefined) {
                stateData.linearStrafeState = "idle";
            }
            if (stateData.linearStrafeTimerId === undefined || stateData.linearStrafeTimerId === null) {
                stateData.linearStrafeTimerId = scheduler.schedule(200 + Math.random() * 500);
            }

            if (scheduler.getTimeRemaining(stateData.linearStrafeTimerId) <= 0) {
                const leftPath = analyzeStrafePath(enemy, tangentX, tangentY, 1, walls, target);
                const rightPath = analyzeStrafePath(enemy, tangentX, tangentY, -1, walls, target);

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
                        enemy.changeState("navigating");
                        return enemy.currentState.update(enemy, dt, target, flowFieldGrid, walls, missiles, spatialHash, scheduler, state);
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

            enemy.separation.update(enemy, spatialHash);
            PhysicsSystem.applyMovement(enemy, dt, false, true, false);

            const hitWall = PhysicsSystem.resolveWallCollisions(enemy, walls, state);
            if (hitWall) {
                stateData.strafeDir *= -1;
                stateData.linearStrafeState = "idle";
                stateData.linearStrafeTimerId = scheduler.schedule(1000 + Math.random() * 1000);
            }
        }

        const angleToTarget = Math.atan2(-dy, -dx);
        enemy.angle = Utilities.turnAngleTowards(enemy.angle, angleToTarget, enemy.turnSpeed, dt);

        enemy.weapon.weaponMode.processTurret(dt, state, enemy, enemy.weapon.chargeTime, enemy.turret, target, !hasLOS, null);

        return false;
    }
}

export class EnemyChargePrepareState {
    update(enemy, dt, target, flowFieldGrid, walls, missiles, spatialHash, scheduler, state) {
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

        enemy.separation.update(enemy, spatialHash);
        PhysicsSystem.applyMovement(enemy, dt, false, true);
        PhysicsSystem.resolveWallCollisions(enemy, walls, state);
        
        if (enemy.turret) {
            enemy.turret.angle = Utilities.turnAngleTowards(enemy.turret.angle, enemy.angle, enemy.turret.turnSpeed, dt);
        }

        const isStable = Math.hypot(enemy.vx, enemy.vy) < enemy.speed * 0.6;
        
        if (enemy.chargeCooldown <= 0 && distToTarget < 220 && distToTarget > 80 && isStable) {
            enemy.changeState("charging_windup", {
                timer: 500,
                targetX: target.x,
                targetY: target.y
            });
            return enemy.currentState.update(enemy, dt, target, flowFieldGrid, walls, missiles, spatialHash, scheduler, state);
        }

        return false;
    }
}

export class EnemyChargeWindupState {
    onEnter(enemy) {
        enemy.vx = 0;
        enemy.vy = 0;
    }
    update(enemy, dt, target, flowFieldGrid, walls, missiles, spatialHash, scheduler, state) {
        enemy.desiredX = 0;
        enemy.desiredY = 0;
        PhysicsSystem.applyMovement(enemy, dt, true, true);
        PhysicsSystem.resolveWallCollisions(enemy, walls, state);

        const dx = target.x - enemy.x;
        const dy = target.y - enemy.y;
        const angleToTarget = Math.atan2(dy, dx);
        enemy.angle = Utilities.turnAngleTowards(enemy.angle, angleToTarget, enemy.turnSpeed * 1.5, dt);

        if (enemy.turret) {
            enemy.turret.angle = Utilities.turnAngleTowards(enemy.turret.angle, enemy.angle, enemy.turret.turnSpeed, dt);
        }

        const stateData = enemy.stateData;
        stateData.timer -= dt;
        if (stateData.timer <= 0) {
            enemy.changeState("charging_dash", {
                timer: 1200,
                dashAngle: Math.atan2(target.y - enemy.y, target.x - enemy.x),
                dashTrail: []
            });
            return enemy.currentState.update(enemy, dt, target, flowFieldGrid, walls, missiles, spatialHash, scheduler, state);
        }

        return false;
    }
    render(enemy, ctx, enemyCache, turretCache) {
        const stateData = enemy.stateData;
        ctx.save();
        ctx.strokeStyle = "rgba(255, 87, 34, 0.4)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(enemy.x, enemy.y);
        ctx.lineTo(stateData.targetX, stateData.targetY);
        ctx.stroke();
        ctx.restore();
        
        ctx.save();
        ctx.strokeStyle = "rgba(255, 152, 0, 0.6)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius + 3 + Math.sin(Date.now() * 0.02) * 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
}

export class EnemyChargeDashState {
    update(enemy, dt, target, flowFieldGrid, walls, missiles, spatialHash, scheduler, state) {
        const stateData = enemy.stateData;
        if (!stateData.dashTrail) stateData.dashTrail = [];
        stateData.dashTrail.push({ x: enemy.x, y: enemy.y });
        if (stateData.dashTrail.length > 4) {
            stateData.dashTrail.shift();
        }

        enemy.desiredX = Math.cos(stateData.dashAngle);
        enemy.desiredY = Math.sin(stateData.dashAngle);
        enemy.angle = stateData.dashAngle;
        if (enemy.turret) {
            enemy.turret.angle = enemy.angle;
        }

        const originalSpeed = enemy.speed;
        enemy.speed = originalSpeed * 2.2;
        const originalAccel = enemy.accelRate;
        enemy.accelRate = originalAccel * 5.0;
        
        PhysicsSystem.applyMovement(enemy, dt, true, true, false);
        
        enemy.speed = originalSpeed;
        enemy.accelRate = originalAccel;

        const hitWall = PhysicsSystem.resolveWallCollisions(enemy, walls, state);

        const dx = target.x - enemy.x;
        const dy = target.y - enemy.y;
        const dot = dx * Math.cos(stateData.dashAngle) + dy * Math.sin(stateData.dashAngle);

        stateData.timer -= dt;
        
        if (stateData.timer <= 0 || dot < -10 || hitWall) {
            enemy.chargeCooldown = 1500;
            enemy.changeState("charging_prepare");
        }

        return false;
    }
    render(enemy, ctx, enemyCache, turretCache) {
        const stateData = enemy.stateData;
        if (stateData.dashTrail && stateData.dashTrail.length > 0) {
            ctx.save();
            for (let i = 0; i < stateData.dashTrail.length; i++) {
                const pt = stateData.dashTrail[i];
                const alpha = ((i + 1) / (stateData.dashTrail.length + 1)) * 0.35;
                ctx.fillStyle = enemy.color;
                ctx.globalAlpha = alpha;
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, enemy.radius * (0.4 + 0.6 * (i / stateData.dashTrail.length)), 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
    }
}

export class EnemyDodgingState {
    update(enemy, dt, target, flowFieldGrid, walls, missiles, spatialHash, scheduler, state) {
        const stateData = enemy.stateData;
        const dx = stateData.targetX - enemy.x;
        const dy = stateData.targetY - enemy.y;
        const dist = Math.hypot(dx, dy);
        const moveDist = enemy.speed * 1.5 * (dt / 1000);

        const targetAngle = Math.atan2(dy, dx);
        enemy.angle = Utilities.turnAngleTowards(enemy.angle, targetAngle, enemy.turnSpeed * 1.5, dt);

        if (dist <= moveDist) {
            enemy.x = stateData.targetX;
            enemy.y = stateData.targetY;
            enemy.changeState("navigating");
        } else {
            enemy.x += (dx / dist) * moveDist;
            enemy.y += (dy / dist) * moveDist;
        }

        if (enemy.turret) {
            enemy.turret.angle = Utilities.turnAngleTowards(enemy.turret.angle, enemy.angle, enemy.turret.turnSpeed, dt);
        }

        return false;
    }
}

export class EnemyBlastedState {
    constructor() {
        this.customMovement = true;
        this.blocksTargeting = true;
        this.blocksInput = true;
    }

    getAimTarget(enemy, target, blocksTargeting, turret) {
        const angle = enemy.stateData.angle || 0;
        return {
            x: enemy.x + Math.cos(angle) * 100,
            y: enemy.y + Math.sin(angle) * 100
        };
    }

    update(enemy, dt, target, flowFieldGrid, walls, missiles, spatialHash, scheduler, state) {
        const stateData = enemy.stateData;
        stateData.timer -= dt;
        if (stateData.timer <= 0) {
            enemy.vx = 0;
            enemy.vy = 0;
            if (enemy.stopMovement) {
                enemy.stopMovement();
            }
            enemy.changeState("navigating");
            return false;
        }

        const ratio = Math.max(0, stateData.timer / 500);
        const launchSpeed = enemy.speed * 6;
        const speed = launchSpeed * Math.pow(ratio, 1.5);

        enemy.vx = Math.cos(stateData.angle) * speed;
        enemy.vy = Math.sin(stateData.angle) * speed;

        enemy.x += enemy.vx * (dt / 1000);
        enemy.y += enemy.vy * (dt / 1000);

        const targetAngle = stateData.angle;
        enemy.angle = Utilities.turnAngleTowards(enemy.angle, targetAngle, enemy.turnSpeed, dt);

        if (enemy.turret) {
            enemy.turret.angle = Utilities.turnAngleTowards(enemy.turret.angle, targetAngle, enemy.turret.turnSpeed, dt);
        }

        PhysicsSystem.resolveWallCollisions(enemy, walls, state);

        return false;
    }
}

export const enemyStates = {
    navigating: new EnemyNavigatingState(),
    engaged: new EnemyEngagedState(),
    charging_prepare: new EnemyChargePrepareState(),
    charging_windup: new EnemyChargeWindupState(),
    charging_dash: new EnemyChargeDashState(),
    dodging: new EnemyDodgingState(),
    blasted: new EnemyBlastedState()
};