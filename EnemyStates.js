import { WeaponSystem } from "./WeaponSystem.js";

export class EnemyNavigatingState {
    update(enemy, dt, target, gridSystem, walls, missiles, spatialHash, scheduler) {
        if (enemy.canDodge && scheduler.getTimeRemaining(enemy.dodgeTimerId) <= 0 && enemy.shouldTriggerDodge(missiles, gridSystem, scheduler)) {
            enemy.changeState("dodging");
            return enemy.currentState.update(enemy, dt, target, gridSystem, walls, missiles, spatialHash, scheduler);
        }

        if (enemy.attackType === "charge") {
            enemy.changeState("charging");
            return enemy.currentState.update(enemy, dt, target, gridSystem, walls, missiles, spatialHash, scheduler);
        }

        const distToTarget = Math.hypot(enemy.x - target.x, enemy.y - target.y);
        if (distToTarget <= target.radius + enemy.attackRange) {
            enemy.changeState("engaged");
            return enemy.currentState.update(enemy, dt, target, gridSystem, walls, missiles, spatialHash, scheduler);
        }

        enemy.calculateSteering(target, gridSystem);
        enemy.calculateSeparation(spatialHash);
        enemy.applyMovement(dt, target, true);
        enemy.resolveWallCollisions(walls);

        enemy.turret.angle = enemy.angle;

        return false;
    }
}

export class EnemyEngagedState {
    update(enemy, dt, target, gridSystem, walls, missiles, spatialHash, scheduler) {
        if (enemy.canDodge && scheduler.getTimeRemaining(enemy.dodgeTimerId) <= 0 && enemy.shouldTriggerDodge(missiles, gridSystem, scheduler)) {
            enemy.changeState("dodging");
            return enemy.currentState.update(enemy, dt, target, gridSystem, walls, missiles, spatialHash, scheduler);
        }

        const distToTarget = Math.hypot(enemy.x - target.x, enemy.y - target.y);
        if (distToTarget > target.radius + enemy.attackRange) {
            enemy.changeState("navigating");
            return enemy.currentState.update(enemy, dt, target, gridSystem, walls, missiles, spatialHash, scheduler);
        }

        enemy.desiredX = target.x - enemy.x;
        enemy.desiredY = target.y - enemy.y;
        
        enemy.calculateSeparation(spatialHash);
        enemy.applyMovement(dt, target, false);
        enemy.resolveWallCollisions(walls);

        const isAimed = WeaponSystem.aimTurret(enemy.turret, enemy.x, enemy.y, target.x, target.y, dt);

        if (scheduler.getTimeRemaining(enemy.fireTimerId) <= 0 && isAimed) {
            enemy.fireTimerId = scheduler.schedule(enemy.fireRate);
            return true;
        }
        return false;
    }
}

export class EnemyChargingState {
    update(enemy, dt, target, gridSystem, walls, missiles, spatialHash, scheduler) {
        const distToTarget = Math.hypot(enemy.x - target.x, enemy.y - target.y);
        enemy.isEngaged = distToTarget <= target.radius + enemy.attackRange;

        enemy.calculateSteering(target, gridSystem);
        enemy.calculateSeparation(spatialHash);
        enemy.applyMovement(dt, target, true);
        enemy.resolveWallCollisions(walls);

        enemy.turret.angle = enemy.angle;

        return false;
    }
}

export class EnemyDodgingState {
    update(enemy, dt, target, gridSystem, walls, missiles, spatialHash, scheduler) {
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

        enemy.turret.angle = enemy.angle;

        return false;
    }
}

export const enemyStates = {
    navigating: new EnemyNavigatingState(),
    engaged: new EnemyEngagedState(),
    charging: new EnemyChargingState(),
    dodging: new EnemyDodgingState()
};