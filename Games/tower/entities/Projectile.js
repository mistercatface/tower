import { circlesOverlap } from "../../../Libraries/Spatial/collision/overlap.js";
import { Entity } from "../../../Entities/Entity.js";
import { drawProjectileTracer } from "../render/ProjectileDraw.js";
import { getProjectileDamage } from "../combat/impactDamage.js";
import { applyActorImpactKnockback } from "../combat/impactKnockback.js";
import { getGunImpactKnockback } from "../combat/gunCombat.js";
import { getGunDefinition } from "../../../Config/content/guns.js";
import { Enemy } from "./Enemy.js";
import { getInteractionPairFilter, getPlayerActors } from "../../../Core/GamePorts.js";
import { RagdollCorpse } from "./RagdollCorpse.js";
// Grenade-specific imports
import { Explosion } from "./Explosion/Explosion.js";
import { ProgressBar } from "../../../Libraries/Canvas/ProgressBar.js";
import { CombatParticles } from "../render/CombatParticles.js";
const grenadeProgressBar = new ProgressBar({ width: 24, height: 4, borderRadius: 2, quantizationSteps: 30, colorFn: () => "#FF1744" });
export const ProjectileStrategies = {
    bullet: {
        move(p, dt) {
            p.x += Math.cos(p.angle) * p.speed * (dt / 1000);
            p.y += Math.sin(p.angle) * p.speed * (dt / 1000);
        },
        update(p, dt, state) {
            p.checkOutOfBounds(state);
        },
        onWallCollision(p, state, segment, events) {
            CombatParticles.spawnImpactSparks(state, p.x, p.y, { impactAngle: p.angle });
            p.isDead = true;
            events.push({ target: segment, damage: p.damage });
        },
        onFactionCollision(p, state, target, events, spatialFrame) {
            const damage = getProjectileDamage(p);
            events.push({ target, damage, projectile: p });
            if (p.gunId && target instanceof Enemy) {
                const impactKnockback = getGunImpactKnockback(getGunDefinition(p.gunId));
                if (impactKnockback) applyActorImpactKnockback(target, p.angle, impactKnockback, spatialFrame, state);
            }
            if (target.health <= damage && p.penetration > 0) p.penetration--;
            else p.isDead = true;
        },
        onPickupCollision(p, state, pickup, events) {
            return pickup.strategy.onHit(state, pickup, p, events);
        },
        render(p, ctx) {
            drawProjectileTracer(ctx, p);
        },
    },
    grenade: {
        move(p, dt) {
            const dragFactor = Math.exp(-p.drag * (dt / 1000));
            p.vx *= dragFactor;
            p.vy *= dragFactor;
            p.x += p.vx * (dt / 1000);
            p.y += p.vy * (dt / 1000);
            const speed = Math.hypot(p.vx, p.vy);
            if (speed > 5) p.angle = Math.atan2(p.vy, p.vx);
        },
        update(p, dt, state) {
            p.fuseTimer -= dt;
            if (p.fuseTimer <= 0) p.explode(state);
            else p.checkOutOfBounds(state);
        },
        onWallCollision(p, state, segment, events) {
            p.explode(state);
        },
        onFactionCollision(p, state, target, events, spatialFrame) {
            p.explode(state);
        },
        onPickupCollision(p, state, pickup, events) {
            p.explode(state);
            return true;
        },
        render(p, ctx, renderer) {
            // Draw a green circular grenade with a flashing red core
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fillStyle = "#2E7D32"; // premium green
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = "#1B5E20"; // dark green border
            ctx.stroke();
            const age = performance.now() - p.spawnTime;
            if (Math.floor(age / 150) % 2 === 0) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius * 0.4, 0, Math.PI * 2);
                ctx.fillStyle = "#FF1744"; // flashing red center
                ctx.fill();
            }
            const ratio = Math.max(0, p.fuseTimer / p.fuseTime);
            grenadeProgressBar.render(ctx, p.x, p.y - p.radius - 8, ratio, renderer.actorCache);
        },
    },
};
export class Projectile extends Entity {
    static checkSpawnCollisions(state, spatialFrame, events) {
        for (const p of state.projectiles) {
            if (!p._spawnFrameCheck || p.isDead) continue;
            p._spawnFrameCheck = false;
            p.resolveFactionCollisions(state, events, spatialFrame);
        }
    }
    static updateAll(state, dt) {
        for (let i = state.projectiles.length - 1; i >= 0; i--) {
            const p = state.projectiles[i];
            p.update(dt, state);
            if (!p.isDead) RagdollCorpse.tryProjectileHit(state, p);
            if (p.isDead) {
                state.projectiles.splice(i, 1);
                state.projectilePool?.release(p);
            }
        }
    }
    constructor(x = 0, y = 0, radius = 0, speed = 0, target = null, angle = null, damage = 0, faction = "player") {
        super(x, y, 0, false);
        if (arguments.length > 0) this.reset(x, y, radius, speed, target, angle, damage, faction);
    }
    reset(x, y, radius, speed, target, angle = null, damage = 0, faction = "player") {
        let initialAngle = 0;
        if (angle !== null && angle !== undefined) initialAngle = angle;
        else if (target) initialAngle = Math.atan2(target.y - y, target.x - x);
        super.reset(x, y, initialAngle, false);
        this.radius = radius;
        this.speed = speed;
        this.target = target;
        this.damage = damage;
        this.faction = faction;
        this._gunId = null;
        this.strategy = ProjectileStrategies.bullet;
        this.penetration = 0;
        this.isPellet = false;
        this.spawnTime = performance.now();
        this._spawnFrameCheck = true;
    }
    set gunId(val) {
        this._gunId = val;
        if (val) {
            const gun = getGunDefinition(val);
            const projConfig = gun?.projectile;
            if (projConfig && projConfig.strategy === "grenade") {
                this.strategy = ProjectileStrategies.grenade;
                this.drag = projConfig.drag ?? 4.0;
                this.fuseTime = projConfig.fuseTimeMs ?? 1500;
                this.fuseTimer = this.fuseTime;
                this.explosionConfig = projConfig.explosion;
                this.vx = Math.cos(this.angle) * this.speed;
                this.vy = Math.sin(this.angle) * this.speed;
            }
        }
    }
    get gunId() {
        return this._gunId;
    }
    move(dt) {
        this.strategy.move(this, dt);
    }
    checkOutOfBounds(state) {
        const anchors = getPlayerActors(state);
        if (anchors.length === 0) return false;
        let minDist = Infinity;
        for (const anchor of anchors) minDist = Math.min(minDist, Math.hypot(this.x - anchor.x, this.y - anchor.y));
        if (minDist > 1500) {
            this.isDead = true;
            return true;
        }
        return false;
    }
    update(dt, state) {
        if (this.isDead) return;
        this.move(dt);
        this.strategy.update(this, dt, state);
    }
    explode(state) {
        if (this.isDead) return;
        this.isDead = true;
        const config = this.explosionConfig || { type: "standard", radius: 0, maxRadius: 60, speed: 250, damage: 3, lingerTimer: 500, fadeTimer: 150 };
        if (!state.explosions) state.explosions = [];
        state.explosions.push(new Explosion(this.x, this.y, config.type || "standard", config));
        CombatParticles.spawnImpactSparks(state, this.x, this.y, { impactAngle: this.angle });
    }
    resolveFactionCollisions(state, events, spatialFrame) {
        spatialFrame.forEachNeighbor(this, (target) => {
            if (this.isDead || !getInteractionPairFilter("projectileHitActor").allows(this, target)) return;
            if (!circlesOverlap(this, target)) return;
            this.strategy.onFactionCollision(this, state, target, events, spatialFrame);
        });
    }
    render(ctx, renderer, state) {
        this.strategy.render(this, ctx, renderer, state);
    }
}
