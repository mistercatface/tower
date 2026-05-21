import { Projectile } from "./Entities.js";
import { CollisionSystem } from "./CollisionSystem.js";
import { Utilities } from "./Utilities.js";

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
                return { hit: 'wall', x: cx, y: cy, dist: dist };
            }
            
            for (const e of state.enemies) {
                if (e.isDead) continue;
                if (CollisionSystem.checkCircle(rayCircle, e)) {
                    const distToEnemy = Math.hypot(e.x - startX, e.y - startY);
                    const exactDist = distToEnemy - e.radius;
                    const finalX = startX + dx * exactDist;
                    const finalY = startY + dy * exactDist;
                    return { hit: 'enemy', entity: e, x: finalX, y: finalY, dist: exactDist };
                }
            }
        }
        return { hit: 'none', x: cx, y: cy, dist: dist };
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

    static updateTurretAndWeapon(dt, blocksTargeting, state, upgrades) {
        const combatEvents = [];

        function fireTurret(turretAngle) {
            const turretDist = state.planet.radius + 12;
            const tx = state.planet.x + Math.cos(turretAngle) * turretDist;
            const ty = state.planet.y + Math.sin(turretAngle) * turretDist;

            const accuracySpread = (1 - state.weapon.accuracy) * Math.PI / 2;
            const spreadAngle = (Math.random() - 0.5) * accuracySpread;
            const finalAngle = turretAngle + spreadAngle;

            let shotOverridden = false;

            for (const upg of upgrades) {
                if (upg.isAbility && state.abilities[upg.id] && upg.abilityShootFn) {
                    if (upg.abilityShootFn(state, tx, ty, finalAngle)) {
                        shotOverridden = true;
                        break;
                    }
                }
            }

            if (!shotOverridden) {
                let m = new Projectile(tx, ty, state.planet.radius * 0.25, 250, null, finalAngle, 0, "player");
                m.penetration = state.weapon.penetration;
                state.projectiles.push(m);
            }
        }

        if (state.currentTarget) {
            const dist = Math.hypot(state.currentTarget.x - state.planet.x, state.currentTarget.y - state.planet.y);
            if (state.currentTarget.isDead || dist > state.weapon.range || !Utilities.hasLineOfSight(state.planet.x, state.planet.y, state.currentTarget.x, state.currentTarget.y, state.walls) || blocksTargeting) {
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
                if (state.currentTarget2.isDead || dist2 > state.weapon.range || !Utilities.hasLineOfSight(state.planet.x, state.planet.y, state.currentTarget2.x, state.currentTarget2.y, state.walls) || blocksTargeting) {
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
        const isLaser = state.abilities["Laser"];
        let laserCanDamage = false;
        if (isLaser) {
            state.weapon.laserTimer = (state.weapon.laserTimer || 0) + dt;
            if (state.weapon.laserTimer >= 200) {
                laserCanDamage = true;
                state.weapon.laserTimer = 0;
            }
        }

        const processTurretRotation = (turret, target, chargeKey) => {
            if (target && !blocksTargeting) {
                const targetAngle = Math.atan2(target.y - state.planet.y, target.x - state.planet.x);
                let diff = targetAngle - turret.angle;
                diff = Utilities.normalizeAngle(diff);

                if (Math.abs(diff) < 0.05) {
                    turret.angle = targetAngle;
                    if (!isLaser) {
                        state.weapon[chargeKey] += dt;
                        if (state.weapon[chargeKey] >= state.weapon.chargeTime) {
                            fireTurret(turret.angle);
                            state.weapon[chargeKey] = 0;
                        }
                    }
                } else {
                    turret.angle += Math.sign(diff) * Math.min(Math.abs(diff), turret.turnSpeed * (dt / 1000));
                    if (!isLaser) state.weapon[chargeKey] = 0;
                }
            } else if (state.planet.isMoving) {
                let tx = state.planet.targetNodeX !== null ? state.planet.targetNodeX : state.planet.targetX;
                let ty = state.planet.targetNodeY !== null ? state.planet.targetNodeY : state.planet.targetY;
                if (tx !== null && ty !== null) {
                    const moveAngle = Math.atan2(ty - state.planet.y, tx - state.planet.x);
                    let diff = moveAngle - turret.angle;
                    diff = Utilities.normalizeAngle(diff);
                    turret.angle += Math.sign(diff) * Math.min(Math.abs(diff), turret.turnSpeed * (dt / 1000));
                }
                if (!isLaser) state.weapon[chargeKey] = 0;
            } else {
                if (!isLaser) state.weapon[chargeKey] = 0;
            }

            if (isLaser) {
                const turretDist = state.planet.radius + 4 + 4 * (state.planet.radius / 8);
                
                const time = state.lastTime || Date.now();
                const phaseOffset = chargeKey === 'charge2' ? Math.PI : 0;
                const accuracySpread = (1 - state.weapon.accuracy) * (Math.PI / 12);
                const laserAngle = turret.angle + Math.sin(time / 150 + phaseOffset) * accuracySpread;
                
                const tx = state.planet.x + Math.cos(turret.angle) * turretDist;
                const ty = state.planet.y + Math.sin(turret.angle) * turretDist;
                const hit = this.castLaser(tx, ty, laserAngle, 2000, state);
                
                state.activeLasers.push({ x1: tx, y1: ty, x2: hit.x, y2: hit.y });
                
                if (laserCanDamage && hit.hit === 'enemy') {
                    const damage = state.weapon.damage;
                    combatEvents.push({ type: 'enemyHit', enemy: hit.entity, damage: damage });
                }
            }
        };

        processTurretRotation(state.turret, state.currentTarget, 'charge');

        if (twoGuns) {
            if (state.weapon.charge2 === undefined) state.weapon.charge2 = 0;
            processTurretRotation(state.turret2, state.currentTarget2, 'charge2');
        }

        return combatEvents;
    }
}