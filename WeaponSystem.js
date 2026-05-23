import { Projectile } from "./Entities.js";
import { CollisionSystem } from "./CollisionSystem.js";
import { Utilities } from "./Utilities.js";

export class ChargedWeaponMode {
    constructor(onFireFn) {
        this.onFire = onFireFn;
    }

    processTurret(dt, state, turret, target, blocksTargeting, chargeKey) {
        const turretDist = state.planet.radius + 12;
        const tx = state.planet.x + Math.cos(turret.angle) * turretDist;
        const ty = state.planet.y + Math.sin(turret.angle) * turretDist;
        
        let isAimed = false;

        if (target && !blocksTargeting) {
            isAimed = WeaponSystem.aimTurret(turret, state.planet.x, state.planet.y, target.x, target.y, dt);
            if (isAimed) {
                state.weapon[chargeKey] += dt;
                if (state.weapon[chargeKey] >= state.weapon.chargeTime) {
                    this.onFire(state, tx, ty, turret.angle);
                    state.weapon[chargeKey] = 0;
                }
            } else {
                state.weapon[chargeKey] = 0;
            }
        } else if (state.planet.isMoving) {
            let ntx = state.planet.targetNodeX !== null ? state.planet.targetNodeX : state.planet.targetX;
            let nty = state.planet.targetNodeY !== null ? state.planet.targetNodeY : state.planet.targetY;
            WeaponSystem.aimTurret(turret, state.planet.x, state.planet.y, ntx, nty, dt);
            state.weapon[chargeKey] = 0;
        } else {
            state.weapon[chargeKey] = 0;
        }
    }
}

export class ContinuousWeaponMode {
    constructor(onTickFn) {
        this.onTick = onTickFn;
    }

    processTurret(dt, state, turret, target, blocksTargeting, chargeKey, combatEvents) {
        const turretDist = state.planet.radius + 4 + 4 * (state.planet.radius / 8);
        const tx = state.planet.x + Math.cos(turret.angle) * turretDist;
        const ty = state.planet.y + Math.sin(turret.angle) * turretDist;

        if (target && !blocksTargeting) {
            WeaponSystem.aimTurret(turret, state.planet.x, state.planet.y, target.x, target.y, dt);
        } else if (state.planet.isMoving) {
            let ntx = state.planet.targetNodeX !== null ? state.planet.targetNodeX : state.planet.targetX;
            let nty = state.planet.targetNodeY !== null ? state.planet.targetNodeY : state.planet.targetY;
            WeaponSystem.aimTurret(turret, state.planet.x, state.planet.y, ntx, nty, dt);
        }

        this.onTick(dt, state, tx, ty, turret, chargeKey, combatEvents);
    }
}

const DEFAULT_WEAPON_MODE = new ChargedWeaponMode((state, tx, ty, turretAngle) => {
    const accuracySpread = ((1 - state.weapon.accuracy) * Math.PI) / 2;
    const spreadAngle = (Math.random() - 0.5) * accuracySpread;
    const finalAngle = turretAngle + spreadAngle;
    const m = new Projectile(tx, ty, state.planet.radius * 0.25, 250, null, finalAngle, 0, "player");
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

    static getNearestEnemy(state, source = state.planet, range = state.weapon.range, excludeTarget = null) {
        let nearest = null;
        let minDist = Infinity;
        for (let i = 0; i < state.enemies.length; i++) {
            const e = state.enemies[i];
            if (excludeTarget && e === excludeTarget) continue;
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

        if (state.currentTarget) {
            const dist = Math.hypot(state.currentTarget.x - state.planet.x, state.currentTarget.y - state.planet.y);
            if (
                state.currentTarget.isDead ||
                dist > state.weapon.range ||
                !Utilities.hasLineOfSight(state.planet.x, state.planet.y, state.currentTarget.x, state.currentTarget.y, state.walls) ||
                blocksTargeting
            ) {
                state.currentTarget = null;
            }
        }
        if (!state.currentTarget && !blocksTargeting) {
            state.currentTarget = this.getNearestEnemy(state);
        }

        const twoGuns = state.abilities["TwoGuns"];
        if (twoGuns) {
            if (state.currentTarget2) {
                const dist2 = Math.hypot(state.currentTarget2.x - state.planet.x, state.currentTarget2.y - state.planet.y);
                if (
                    state.currentTarget2.isDead ||
                    dist2 > state.weapon.range ||
                    !Utilities.hasLineOfSight(state.planet.x, state.planet.y, state.currentTarget2.x, state.currentTarget2.y, state.walls) ||
                    blocksTargeting
                ) {
                    state.currentTarget2 = null;
                } else if (state.currentTarget2 === state.currentTarget && this.getNearestEnemy(state, state.planet, state.weapon.range, state.currentTarget) !== null) {
                    state.currentTarget2 = null;
                }
            }
            if (!state.currentTarget2 && !blocksTargeting) {
                state.currentTarget2 = this.getNearestEnemy(state, state.planet, state.weapon.range, state.currentTarget);
                if (!state.currentTarget2) state.currentTarget2 = state.currentTarget;
            }
        }

        state.activeLasers = [];
        let mode = DEFAULT_WEAPON_MODE;
        if (upgrades) {
            const activeAbilityWithMode = upgrades.find(u => u.isAbility && state.abilities[u.id] && u.weaponMode);
            if (activeAbilityWithMode) {
                mode = activeAbilityWithMode.weaponMode;
            }
        }

        mode.processTurret(dt, state, state.turret, state.currentTarget, blocksTargeting, "charge", combatEvents);

        if (twoGuns) {
            if (state.weapon.charge2 === undefined) state.weapon.charge2 = 0;
            mode.processTurret(dt, state, state.turret2, state.currentTarget2, blocksTargeting, "charge2", combatEvents);
        }

        return combatEvents;
    }
}