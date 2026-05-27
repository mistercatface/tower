import { Entity } from "./Entity.js";
import { PhysicsSystem } from "../Spatial/PhysicsSystem.js";
import { RenderSprites } from "../Render/RenderSprites.js";

export class Projectile extends Entity {
    static updateAll(state, dt) {
        for (let i = state.projectiles.length - 1; i >= 0; i--) {
            const p = state.projectiles[i];
            p.update(dt, state.canvasBounds);
            if (p.isDead) state.projectiles.splice(i, 1);
        }
    }

    constructor(x, y, radius, speed, target, angle = null, damage = 0, faction = "player") {
        let initialAngle = 0;
        if (angle !== null && angle !== undefined) {
            initialAngle = angle;
        } else if (target) {
            initialAngle = Math.atan2(target.y - y, target.x - x);
        }
        
        super(x, y, initialAngle, false);
        this.radius = radius;
        this.speed = speed;
        this.target = target;
        this.damage = damage;
        this.faction = faction;
    }

    move(dt) {
        this.x += Math.cos(this.angle) * this.speed * (dt / 1000);
        this.y += Math.sin(this.angle) * this.speed * (dt / 1000);
    }

    checkOutOfBounds(canvasBounds) {
        const padding = 500;
        if (this.x < -padding || this.x > canvasBounds.width + padding || this.y < -padding || this.y > canvasBounds.height + padding) {
            this.isDead = true;
            return true;
        }
        return false;
    }

    update(dt, canvasBounds) {
        this.move(dt);
        this.checkOutOfBounds(canvasBounds);
    }

    resolveFactionCollisions(state, events, system) {
        if (this.faction === "player") {
            if (state.abilities["Eraser"]) {
                for (const ep of state.projectiles) {
                    if (ep.isDead || ep.faction !== "enemy") continue;
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
            for (const e of state.enemies) {
                if (e.isDead) continue;
                if (system.checkCircle(this, e)) {
                    events.push({ target: e, damage: state.weapon.damage });
                    PhysicsSystem.applyKnockback(e, this.angle, this.radius * 150);
                    if (e.health <= state.weapon.damage && this.penetration > 0) {
                        this.penetration--;
                        e.health -= state.weapon.damage;
                    } else {
                        this.isDead = true;
                        break;
                    }
                }
            }
        } else if (this.faction === "enemy") {
            if (system.checkCircle(this, state.planet)) {
                this.isDead = true;
                events.push({ target: state.planet, damage: this.damage });
                PhysicsSystem.applyKnockback(state.planet, this.angle, this.radius * 150);
            }
        }
    }

    render(ctx, renderer) {
        const color = this.faction === "player" ? "#FFEB3B" : "#F44336";
        const cacheKey = `${this.radius}_${color}`;
        this.renderCachedSprite(ctx, renderer.missileCache, cacheKey, RenderSprites.missile, this.radius, color);
    }
}