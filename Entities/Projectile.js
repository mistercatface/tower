import { CollisionSystem } from "../Spatial/Collision/CollisionSystem.js";
import { Entity } from "./Entity.js";
import { Pools } from "../Core/Pools.js";
import { drawProjectileTracer } from "../Render/ProjectileDraw.js";
import { getProjectileDamage } from "../Combat/impactDamage.js";
import { applyActorImpactKnockback } from "../Combat/impactKnockback.js";
import { getGunImpactKnockback } from "../Combat/gunCombat.js";
import { getGunDefinition } from "../Config/gunDefinitions.js";
import { Enemy } from "./Enemy.js";
import { getPlayerActors, areHostile } from "../Combat/Targeting.js";
import { Actor } from "./Actor.js";
export class Projectile extends Entity {
    static checkSpawnCollisions(state, spatialFrame, events) {
        for (const p of state.projectiles) {
            if (!p._spawnFrameCheck || p.isDead) continue;
            p._spawnFrameCheck = false;
            p.resolveFactionCollisions(state, events, CollisionSystem, spatialFrame);
        }
    }

    static updateAll(state, dt) {
        for (let i = state.projectiles.length - 1; i >= 0; i--) {
            const p = state.projectiles[i];
            p.update(dt, state);
            if (p.isDead) {
                state.projectiles.splice(i, 1);
                Pools.projectiles.release(p);
            }
        }
    }

    constructor(x = 0, y = 0, radius = 0, speed = 0, target = null, angle = null, damage = 0, faction = "player") {
        super(x, y, 0, false);
        if (arguments.length > 0) {
            this.reset(x, y, radius, speed, target, angle, damage, faction);
        }
    }

    reset(x, y, radius, speed, target, angle = null, damage = 0, faction = "player") {
        let initialAngle = 0;
        if (angle !== null && angle !== undefined) {
            initialAngle = angle;
        } else if (target) {
            initialAngle = Math.atan2(target.y - y, target.x - x);
        }

        super.reset(x, y, initialAngle, false);
        this.radius = radius;
        this.speed = speed;
        this.target = target;
        this.damage = damage;
        this.faction = faction;
        this.gunId = null;
        this.penetration = 0;
        this.isPellet = false;
        this.spawnTime = performance.now();
        this._spawnFrameCheck = true;
    }

    move(dt) {
        this.x += Math.cos(this.angle) * this.speed * (dt / 1000);
        this.y += Math.sin(this.angle) * this.speed * (dt / 1000);
    }

    checkOutOfBounds(state) {
        const anchors = getPlayerActors(state);
        if (anchors.length === 0) return false;

        let minDist = Infinity;
        for (const anchor of anchors) {
            minDist = Math.min(minDist, Math.hypot(this.x - anchor.x, this.y - anchor.y));
        }

        if (minDist > 1500) {
            this.isDead = true;
            return true;
        }
        return false;
    }

    update(dt, state) {
        if (this.isDead) return;
        this.move(dt);
        this.checkOutOfBounds(state);
    }

    resolveFactionCollisions(state, events, system, spatialFrame) {
        spatialFrame.forEachNeighbor(this, (target) => {
            if (this.isDead || !(target instanceof Actor)) return;
            if (!areHostile(this, target)) return;
            if (target.isDead) return;
            if (!system.checkCircle(this, target)) return;

            const damage = getProjectileDamage(this);
            events.push({ target, damage, projectile: this });

            if (this.gunId && target instanceof Enemy) {
                const impactKnockback = getGunImpactKnockback(getGunDefinition(this.gunId));
                if (impactKnockback) {
                    applyActorImpactKnockback(target, this.angle, impactKnockback, spatialFrame, state);
                }
            }
            if (target.health <= damage && this.penetration > 0) {
                this.penetration--;
            } else {
                this.isDead = true;
            }
        });
    }

    render(ctx) {
        drawProjectileTracer(ctx, this);
    }
}

Pools.projectiles.createFn = () => new Projectile();
