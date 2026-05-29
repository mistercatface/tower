import { Projectile } from "../Entities/Projectile.js";
import { CollisionSystem } from "../Spatial/Collision/CollisionSystem.js";
import { Utilities } from "../Core/Utilities.js";
import { PhysicsSystem } from "../Spatial/Motion/PhysicsSystem.js";
import { playerProjectileSettings } from "../Config/Config.js";
import { Pools } from "../Core/Pools.js";

class WeaponTargetingStrategy {
    determineAimTarget(source, target, blocksTargeting, turret) {
        if (source.currentState && source.currentState.getAimTarget) {
            return source.currentState.getAimTarget(source, target, blocksTargeting, turret);
        }
        if (target && !blocksTargeting) {
            return target;
        }
        if (source.isMoving) {
            return {
                x: source.targetNodeX !== null ? source.targetNodeX : source.targetX,
                y: source.targetNodeY !== null ? source.targetNodeY : source.targetY
            };
        }
        return {
            x: source.x + Math.cos(turret.angle) * 100,
            y: source.y + Math.sin(turret.angle) * 100
        };
    }
}

export class ChargedWeaponMode extends WeaponTargetingStrategy {
    constructor(onFireFn) {
        super();
        this.onFire = onFireFn;
    }

    processTurret(dt, state, source, chargeTime, turret, target, blocksTargeting, combatEvents) {
        const turretDist = source.radius + 12;
        const tx = source.x + Math.cos(turret.angle) * turretDist;
        const ty = source.y + Math.sin(turret.angle) * turretDist;
        const aimTarget = this.determineAimTarget(source, target, blocksTargeting, turret);
        
        const sway = WeaponSystem.computeAccuracySway(source, turret, dt, true);

        const isAimed = WeaponSystem.aimTurret(turret, source.x, source.y, aimTarget.x, aimTarget.y, dt, sway);
        if (target && !blocksTargeting) {
            if (turret.lastTarget !== target) {
                turret.charge = 0;
                turret.lastTarget = target;
            }
            if (isAimed) {
                turret.charge += dt;
                if (turret.charge >= chargeTime) {
                    this.onFire(state, tx, ty, turret.angle, source);
                    turret.charge = 0;
                }
            }
        } else {
            turret.charge = 0;
            turret.lastTarget = null;
        }
    }
}

export class ContinuousWeaponMode extends WeaponTargetingStrategy {
    constructor(onTickFn) {
        super();
        this.onTick = onTickFn;
    }

    processTurret(dt, state, source, chargeTime, turret, target, blocksTargeting, combatEvents) {
        const turretDist = source.radius + 4 + 4 * (source.radius / 8);
        const tx = source.x + Math.cos(turret.angle) * turretDist;
        const ty = source.y + Math.sin(turret.angle) * turretDist;
        const aimTarget = this.determineAimTarget(source, target, blocksTargeting, turret);

        const sway = WeaponSystem.computeAccuracySway(source, turret, dt);

        WeaponSystem.aimTurret(turret, source.x, source.y, aimTarget.x, aimTarget.y, dt, sway);
        this.onTick(dt, state, tx, ty, turret, combatEvents, source);
    }
}

const DEFAULT_WEAPON_MODE = new ChargedWeaponMode((state, tx, ty, turretAngle, source) => {
    const m = Pools.projectiles.acquire(tx, ty, source.radius * playerProjectileSettings.radiusMultiplier, playerProjectileSettings.speed, null, turretAngle, 0, "player");
    m.penetration = state.player.weapon.penetration;
    state.projectiles.push(m);
    if (source) {
        PhysicsSystem.applyKnockback(source, turretAngle + Math.PI, m.radius * playerProjectileSettings.knockbackMultiplier);
    }
});

export class WeaponSystem {
    static castLaser(startX, startY, angle, maxDist, state) {
        const step = 8;
        let dist = 0;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        let cx = startX;
        let cy = startY;
        const rayCircle = { x: cx, y: cy, radius: 1 };

        const endX = startX + dx * maxDist;
        const endY = startY + dy * maxDist;

        let candidateWalls = state.walls;
        if (state.obstacleGrid) {
            candidateWalls = Utilities.getSegmentsAlongLine(startX, startY, endX, endY, state.obstacleGrid);
        } else {
            const minX = Math.min(startX, endX);
            const maxX = Math.max(startX, endX);
            const minY = Math.min(startY, endY);
            const maxY = Math.max(startY, endY);
            const temp = [];
            for (const seg of state.walls) {
                if (seg.isDead) continue;
                const limit = seg.size * 0.75 + 1.5;
                if (seg.x < minX - limit || seg.x > maxX + limit ||
                    seg.y < minY - limit || seg.y > maxY + limit) {
                    continue;
                }
                temp.push(seg);
            }
            candidateWalls = temp;
        }

        while (dist < maxDist) {
            cx += dx * step;
            cy += dy * step;
            dist += step;
            rayCircle.x = cx;
            rayCircle.y = cy;

            let hitWall = false;
            for (const seg of candidateWalls) {
                if (CollisionSystem.checkCircleRect(rayCircle, seg)) {
                    hitWall = true;
                    break;
                }
            }

            if (hitWall) {
                while (hitWall && dist > 0) {
                    cx -= dx;
                    cy -= dy;
                    dist -= 1;
                    rayCircle.x = cx;
                    rayCircle.y = cy;
                    hitWall = false;
                    for (const seg of candidateWalls) {
                        if (CollisionSystem.checkCircleRect(rayCircle, seg)) {
                            hitWall = true;
                            break;
                        }
                    }
                }
                return { hit: "wall", x: cx, y: cy, dist: dist };
            }

            for (const p of state.pickups) {
                if (p.isDead || !p.strategy?.laserTargetable) continue;
                if (CollisionSystem.checkCircle(rayCircle, p)) {
                    const distToPickup = Math.hypot(p.x - startX, p.y - startY);
                    const exactDist = distToPickup - p.radius;
                    const finalX = startX + dx * exactDist;
                    const finalY = startY + dy * exactDist;
                    return { hit: "pickup", entity: p, x: finalX, y: finalY, dist: exactDist };
                }
            }

            for (const e of state.enemies) {
                if (e.isDead) continue;
                if (CollisionSystem.checkCircle(rayCircle, e)) {
                    const distToEnemy = Math.hypot(e.x - startX, e.y - startY);
                    const exactDist = distToEnemy - e.radius;
                    const finalX = startX + dx * exactDist;
                    const finalY = startY + dy * exactDist;
                    return { hit: "enemy", entity: e, x: finalX, y: finalY, dist: exactDist };
                }
            }
        }
        return { hit: "none", x: cx, y: cy, dist: dist };
    }

    static getNearestEnemy(state, source = state.player, range = state.player.weapon.range, excludedTargets = null) {
        let nearest = null;
        let minDist = Infinity;
        for (let i = 0; i < state.enemies.length; i++) {
            const e = state.enemies[i];
            if (excludedTargets && excludedTargets.has(e)) continue;
            const dist = Math.hypot(e.x - source.x, e.y - source.y);
            if (dist <= range && dist < minDist) {
                if (Utilities.hasLineOfSight(source.x, source.y, e.x, e.y, state.walls)) {
                    minDist = dist;
                    nearest = e;
                }
            }
        }
        return nearest;
    }

    static computeAccuracySway(source, turret, dt, requireCharge = false) {
        const weapon = source.weapon;
        if (!weapon || weapon.accuracy === undefined) return 0;
        if (requireCharge && turret.charge <= 0) return 0;

        const effectiveAccuracy = source.applyMovementAccuracyPenalty(weapon.accuracy);
        const accuracySpread = ((1 - effectiveAccuracy) * Math.PI) / 2 * 0.5;
        const frequency = 0.005;
        turret.swayPhase += dt * frequency;
        const turretsList = source.turrets || (source.turret ? [source.turret] : null);
        const phaseOffset = turretsList ? turretsList.indexOf(turret) * 2.0 : 0;
        return Math.sin(turret.swayPhase + phaseOffset) * accuracySpread;
    }

    static aimTurret(turret, currentX, currentY, targetX, targetY, dt, sway = 0) {
        if (targetX === null || targetY === null) return false;
        let targetAngle = Math.atan2(targetY - currentY, targetX - currentX);
        targetAngle += sway;
        let diff = targetAngle - turret.angle;
        diff = Utilities.normalizeAngle(diff);

        if (Math.abs(diff) < 0.05) {
            turret.angle = targetAngle;
            return true;
        } else {
            turret.angle += Math.sign(diff) * Math.min(Math.abs(diff), turret.turnSpeed * (dt / 1000));
            turret.angle = Utilities.normalizeAngle(turret.angle);
            return false;
        }
    }

    static updateTurretAndWeapon(dt, blocksTargeting, state, upgrades) {
        const combatEvents = [];
        state.activeLasers = [];

        let mode = DEFAULT_WEAPON_MODE;
        if (upgrades) {
            const activeAbilityWithMode = upgrades.find(u => u.isAbility && state.abilities[u.id] && u.weaponMode);
            if (activeAbilityWithMode) {
                mode = activeAbilityWithMode.weaponMode;
            }
        }

        const engagedTargets = new Set();
        const actualBlocksTargeting = blocksTargeting || (state.player && state.player.currentState && state.player.currentState.blocksTargeting);

        for (const turret of state.turrets) {
            if (turret.target) {
                const dist = Math.hypot(turret.target.x - state.player.x, turret.target.y - state.player.y);
                if (
                    turret.target.isDead ||
                    dist > state.player.weapon.range ||
                    !Utilities.hasLineOfSight(state.player.x, state.player.y, turret.target.x, turret.target.y, state.walls) ||
                    actualBlocksTargeting
                ) {
                    turret.target = null;
                } else if (engagedTargets.has(turret.target)) {
                    const betterTarget = this.getNearestEnemy(state, state.player, state.player.weapon.range, engagedTargets);
                    if (betterTarget) {
                        turret.target = betterTarget;
                    }
                }
            }

            if (!turret.target && !actualBlocksTargeting) {
                turret.target = this.getNearestEnemy(state, state.player, state.player.weapon.range, engagedTargets);
                if (!turret.target) {
                    turret.target = this.getNearestEnemy(state, state.player, state.player.weapon.range);
                }
            }

            if (turret.target) {
                engagedTargets.add(turret.target);
            }

            mode.processTurret(dt, state, state.player, state.player.weapon.chargeTime, turret, turret.target, actualBlocksTargeting, combatEvents);
        }

        return combatEvents;
    }
}