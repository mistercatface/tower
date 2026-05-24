import { Projectile } from "./Entities/Projectile.js";
import { CollisionSystem } from "./Spatial/CollisionSystem.js";
import { Utilities } from "./Utilities.js";

class WeaponTargetingStrategy {
    determineAimTarget(source, target, blocksTargeting, turret) {
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
        const isAimed = WeaponSystem.aimTurret(turret, source.x, source.y, aimTarget.x, aimTarget.y, dt);
        if (target && !blocksTargeting && isAimed) {
            turret.charge += dt;
            if (turret.charge >= chargeTime) {
                this.onFire(state, tx, ty, turret.angle, source);
                turret.charge = 0;
            }
        } else {
            turret.charge = 0;
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
        WeaponSystem.aimTurret(turret, source.x, source.y, aimTarget.x, aimTarget.y, dt);
        this.onTick(dt, state, tx, ty, turret, combatEvents, source);
    }
}

const DEFAULT_WEAPON_MODE = new ChargedWeaponMode((state, tx, ty, turretAngle, source) => {
    const accuracySpread = ((1 - state.weapon.accuracy) * Math.PI) / 2;
    const spreadAngle = (Math.random() - 0.5) * accuracySpread;
    const finalAngle = turretAngle + spreadAngle;
    const m = new Projectile(tx, ty, source.radius * 0.25, 250, null, finalAngle, 0, "player");
    m.penetration = state.weapon.penetration;
    state.projectiles.push(m);
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

        while (dist < maxDist) {
            cx += dx * step;
            cy += dy * step;
            dist += step;
            rayCircle.x = cx;
            rayCircle.y = cy;

            let hitWall = false;
            for (const seg of state.walls) {
                if (seg.isDead) continue;
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
                    for (const seg of state.walls) {
                        if (seg.isDead) continue;
                        if (CollisionSystem.checkCircleRect(rayCircle, seg)) {
                            hitWall = true;
                            break;
                        }
                    }
                }
                return { hit: "wall", x: cx, y: cy, dist: dist };
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

    static getNearestEnemy(state, source = state.planet, range = state.weapon.range, excludedTargets = null) {
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

    static aimTurret(turret, currentX, currentY, targetX, targetY, dt) {
        if (targetX === null || targetY === null) return false;
        const targetAngle = Math.atan2(targetY - currentY, targetX - currentX);
        let diff = targetAngle - turret.angle;
        diff = Utilities.normalizeAngle(diff);

        if (Math.abs(diff) < 0.05) {
            turret.angle = targetAngle;
            return true; 
        } else {
            turret.angle += Math.sign(diff) * Math.min(Math.abs(diff), turret.turnSpeed * (dt / 1000));
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

        for (const turret of state.turrets) {
            if (turret.target) {
                const dist = Math.hypot(turret.target.x - state.planet.x, turret.target.y - state.planet.y);
                if (
                    turret.target.isDead ||
                    dist > state.weapon.range ||
                    !Utilities.hasLineOfSight(state.planet.x, state.planet.y, turret.target.x, turret.target.y, state.walls) ||
                    blocksTargeting
                ) {
                    turret.target = null;
                } else if (engagedTargets.has(turret.target)) {
                    const betterTarget = this.getNearestEnemy(state, state.planet, state.weapon.range, engagedTargets);
                    if (betterTarget) {
                        turret.target = betterTarget;
                    }
                }
            }

            if (!turret.target && !blocksTargeting) {
                turret.target = this.getNearestEnemy(state, state.planet, state.weapon.range, engagedTargets);
                if (!turret.target) {
                    turret.target = this.getNearestEnemy(state, state.planet, state.weapon.range);
                }
            }

            if (turret.target) {
                engagedTargets.add(turret.target);
            }

            mode.processTurret(dt, state, state.planet, state.weapon.chargeTime, turret, turret.target, blocksTargeting, combatEvents);
        }

        return combatEvents;
    }
}