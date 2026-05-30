import { Entity } from "./Entity.js";
import { PhysicsSystem } from "../Spatial/Motion/PhysicsSystem.js";
import { RenderSprites } from "../Render/RenderSprites.js";
import { Pools } from "../Core/Pools.js";
import { GhostTrail } from "../Render/GhostTrail.js";
import { getProjectileDamage } from "../Combat/impactDamage.js";
import { getGunProjectileConfig } from "../Combat/gunCombat.js";
import { getGunDefinition } from "../Config/gunDefinitions.js";
import { getHostilesForFaction, getPlayerActors, areHostile } from "../Combat/Targeting.js";

export class Projectile extends Entity {
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

        if (!this.ghostTrail) {
            this.ghostTrail = new GhostTrail({ length: 5, alpha: 0.4, minDistance: 4, lifetime: 300, shrink: true });
        } else {
            this.ghostTrail.reset();
        }
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
        this.move(dt);
        this.checkOutOfBounds(state);
        this.ghostTrail?.update(dt, this.x, this.y, this.angle);
    }

    getHitKnockbackScale() {
        if (!this.gunId) return 150;
        return getGunProjectileConfig(getGunDefinition(this.gunId)).hitKnockbackScale;
    }

    getRenderColor() {
        if (!this.gunId) {
            return this.getProjectileColorFallback();
        }
        return getGunProjectileConfig(getGunDefinition(this.gunId)).color;
    }

    getProjectileColorFallback() {
        return this.faction === "enemy" ? "#F44336" : "#FFEB3B";
    }

    resolveFactionCollisions(state, events, system) {
        const eraserOwner = state.player;
        if (eraserOwner?.canEraseHostileProjectiles?.(state)) {
            for (const ep of state.projectiles) {
                if (ep.isDead || ep === this || !areHostile(eraserOwner, ep)) continue;
                if (system.checkCircle(this, ep)) {
                    ep.isDead = true;
                    if (this.penetration > 0) {
                        this.penetration--;
                    } else {
                        this.isDead = true;
                        break;
                    }
                }
            }
            if (this.isDead) return;
        }

        for (const target of getHostilesForFaction(state, this.faction)) {
            if (target.isDead) continue;
            if (system.checkCircle(this, target)) {
                const damage = getProjectileDamage(this);
                events.push({ target, damage, projectile: this });
                PhysicsSystem.applyKnockback(target, this.angle, this.radius * this.getHitKnockbackScale());
                if (target.health <= damage && this.penetration > 0) {
                    this.penetration--;
                } else {
                    this.isDead = true;
                    break;
                }
            }
        }
    }

    render(ctx, renderer) {
        const color = this.getRenderColor();
        const cacheKey = `${this.radius}_${color}`;
        this.renderCachedSprite(ctx, renderer.missileCache, cacheKey, RenderSprites.missile, this.radius, color);
    }
}

Pools.projectiles.createFn = () => new Projectile();
