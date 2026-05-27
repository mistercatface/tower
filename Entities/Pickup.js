import { Entity } from "./Entity.js";
import { Explosion } from "./Explosion/Explosion.js";
import { PhysicsSystem } from "../Spatial/PhysicsSystem.js";
import { RenderSprites } from "../Render/RenderSprites.js";

export const PickupStrategies = {
    coin: {
        radius: 8,
        render(ctx, cx, cy, radius) {
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fillStyle = "#FFEB3B";
            ctx.fill();
            ctx.lineWidth = 1;
            ctx.strokeStyle = "#FBC02D";
            ctx.stroke();

            ctx.fillStyle = "#000";
            ctx.font = "10px monospace";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("$", cx, cy + 1);
        },
        onCollect(state, pickup, upgrades) {
            let unlockedLaser = false;
            if (state.upgrades["Laser"].level === 0) {
                state.upgrades["Laser"].baseLevel = 1;
                state.upgrades["Laser"].level = 1;
                state.abilities["Laser"] = true;
                state.discoveredAbilities.add("Laser");

                ["TwinStrike", "TripleStrike"].forEach((repId) => {
                    if (state.upgrades[repId]) {
                        state.upgrades[repId].level = 0;
                        state.upgrades[repId].baseLevel = 0;
                    }
                    state.abilities[repId] = false;
                });

                state.recalculateStats(upgrades);
                unlockedLaser = true;
            }
            pickup.isDead = true;
            return { type: "coin", unlockedLaser };
        },
        onHit(state, pickup, projectile, events) {
            return false;
        }
    },
    eyeball: {
        radius: 8,
        render(ctx, cx, cy, radius) {
            ctx.beginPath();
            ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
            ctx.fillStyle = "#2196F3";
            ctx.fill();

            ctx.beginPath();
            ctx.arc(cx, cy, radius * 0.25, 0, Math.PI * 2);
            ctx.fillStyle = "#000000";
            ctx.fill();
        },
        onCollect(state, pickup, upgrades) {
            pickup.isDead = true;
            return { type: "eyeball" };
        },
        onHit(state, pickup, projectile, events) {
            return false;
        }
    },
    barrel: {
        radius: 3,
        render(ctx, cx, cy, radius) {
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fillStyle = "#E53935";
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = "#B71C1C";
            ctx.stroke();
        },
        onCollect(state, pickup, upgrades) {
            return null;
        },
        onHit(state, pickup, projectile, events) {
            pickup.isDead = true;
            projectile.isDead = true;
            if (!state.explosions) state.explosions = [];
            state.explosions.push(new Explosion(pickup.x, pickup.y, "standard", {
                radius: 0,
                maxRadius: 100,
                speed: 300,
                damage: 100,
                lingerTimer: 750,
                fadeTimer: 250
            }));
            return true;
        }
    }
};

export class Pickup extends Entity {
    constructor(x, y, type) {
        super(x, y, 0, false);
        this.type = type;
        this.strategy = PickupStrategies[type];
        this.radius = this.strategy.radius;
        this.vx = 0;
        this.vy = 0;
        this.mass = 1;
    }

    update(dt, walls) {
        PhysicsSystem.applyFrictionAndDrag(this, dt, 8);
        if (this.type === "barrel" && walls) {
            PhysicsSystem.resolveWallCollisions(this, walls);
        }
    }

    render(ctx, pickupCache) {
        const cacheKey = `${this.type}_${this.radius}`;
        this.renderCachedSprite(ctx, pickupCache, cacheKey, RenderSprites.pickup, this.type, this.radius, this.strategy);
    }
}