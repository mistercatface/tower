import { circlesOverlap } from "../Libraries/Spatial/collision/overlap.js";
import { Entity } from "./Entity.js";
import { drawProjectileTracer } from "../Libraries/Render/projectileDraw.js";
import { getProjectileDamage } from "../Libraries/Combat/impactDamage.js";
import { getInteractionPairFilter } from "../Core/interactionPairFilters.js";
import { playBoundsFromObstacleGrid } from "../Libraries/WorldGen/playBounds.js";
import { RagdollCorpse } from "./RagdollCorpse.js";
import { CombatParticles } from "../Libraries/Render/CombatParticles.js";
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
};
export class Projectile extends Entity {
    static checkSpawnCollisions(state, spatialFrame, events) {
        if (!state.projectiles) return;
        for (const p of state.projectiles) {
            if (!p._spawnFrameCheck || p.isDead) continue;
            p._spawnFrameCheck = false;
            p.resolveFactionCollisions(state, events, spatialFrame);
        }
    }
    static updateAll(state, dt) {
        if (!state.projectiles) return;
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
    }
    get gunId() {
        return this._gunId;
    }
    move(dt) {
        this.strategy.move(this, dt);
    }
    checkOutOfBounds(state) {
        const bounds = playBoundsFromObstacleGrid(state.obstacleGrid);
        if (bounds) {
            if (this.x < bounds.minX - 500 || this.x > bounds.maxX + 500 || this.y < bounds.minY - 500 || this.y > bounds.maxY + 500) {
                this.isDead = true;
                return true;
            }
        } else if (Math.abs(this.x) > 3000 || Math.abs(this.y) > 3000) {
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
    resolveFactionCollisions(state, events, spatialFrame) {
        spatialFrame.forEachNeighbor(this, (target) => {
            if (this.isDead || !getInteractionPairFilter("projectileHitActor").allows(this, target)) return;
            if (!circlesOverlap(this, target)) return;
            this.strategy.onFactionCollision(this, state, target, events, spatialFrame);
        });
    }
    render(ctx, renderer, state) {
        this.strategy.render(this, ctx, renderer.caches, state);
    }
}
