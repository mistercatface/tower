import { Entity } from "./Entity.js";
import { Explosion } from "./Explosion/Explosion.js";
import { PhysicsSystem } from "../Spatial/Motion/PhysicsSystem.js";
import { RenderSprites } from "../Render/RenderSprites.js";
import { StatsManager } from "../Progression/StatsManager.js";
import { pickupSpawnSettings } from "../Config/Config.js";

const PICKUP_STRATEGY_DEFAULTS = {
    isPushable: false,
    renderMode: "sprite",
    render3DKey: null,
    isExplosive: false,
    laserTargetable: false,
    mass: 1,
    friction: 8,
    wallPhysics: null,
    maxHealth: null,
};

function withPickupDefaults(strategy) {
    return { ...PICKUP_STRATEGY_DEFAULTS, ...strategy };
}

function spawnExplosion(state, x, y, config) {
    if (!state.explosions) state.explosions = [];
    state.explosions.push(new Explosion(x, y, config.type, config));
}

function explosiveOnHit(state, pickup, projectile, events) {
    pickup.isDead = true;
    if (projectile?.isDead !== undefined) projectile.isDead = true;
    spawnExplosion(state, pickup.x, pickup.y, pickup.strategy.explosion);
    return true;
}

function damageOnHit(state, pickup, projectile, events) {
    const dmg = projectile?.damage ?? state.player.weapon.damage;
    pickup.takeDamage(dmg);
    if (projectile?.isDead !== undefined) projectile.isDead = true;
    return true;
}

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

                StatsManager.recalculateStats(state, upgrades);
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
    barrel: withPickupDefaults({
        radius: 8,
        isPushable: true,
        renderMode: "3d",
        render3DKey: "barrel",
        isExplosive: true,
        laserTargetable: true,
        wallPhysics: { restitution: 0.25, friction: 0.75 },
        explosion: {
            type: "standard",
            radius: 0,
            maxRadius: 100,
            speed: 300,
            damage: 100,
            lingerTimer: 750,
            fadeTimer: 250,
        },
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
        onHit: explosiveOnHit,
    }),
    crate: withPickupDefaults({
        radius: 8,
        isPushable: true,
        renderMode: "3d",
        render3DKey: "crate",
        laserTargetable: true,
        maxHealth: 30,
        mass: 1.5,
        wallPhysics: { restitution: 0.15, friction: 0.8 },
        render(ctx, cx, cy, radius) {
            ctx.fillStyle = "#8D6E63";
            ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
            ctx.strokeStyle = "#5D4037";
            ctx.lineWidth = 1;
            ctx.strokeRect(cx - radius, cy - radius, radius * 2, radius * 2);
        },
        onCollect(state, pickup, upgrades) {
            return null;
        },
        onHit: damageOnHit,
    }),
};

export class Pickup extends Entity {
    constructor(x, y, type) {
        super(x, y, 0, false);
        this.type = type;
        this.strategy = withPickupDefaults(PickupStrategies[type]);
        this.radius = this.strategy.radius;
        this.vx = 0;
        this.vy = 0;
        this.mass = this.strategy.mass;
        this.zIndex = 10;
        if (this.strategy.maxHealth != null) {
            this.maxHealth = this.strategy.maxHealth;
            this.health = this.strategy.maxHealth;
        }
    }

    takeDamage(amount) {
        if (this.maxHealth == null) return false;
        this.health -= amount;
        if (this.health <= 0 && !this.isDead) {
            this.isDead = true;
            return true;
        }
        return false;
    }

    update(dt, walls) {
        PhysicsSystem.applyFrictionAndDrag(this, dt, this.strategy.friction);
        if (this.strategy.isPushable && walls) {
            PhysicsSystem.resolveWallCollisions(this, walls);
        }
    }

    render(ctx, renderer) {
        if (this.strategy.renderMode === "3d") {
            return;
        }
        const cacheKey = `${this.type}_${this.radius}`;
        this.renderCachedSprite(ctx, renderer.pickupCache, cacheKey, RenderSprites.pickup, this.type, this.radius, this.strategy);
    }
}

export function spawnPickup(state, playerX, playerY, minRadius, maxRadius, type) {
    const grid = state.flowFieldGrid;
    let spawned = false;
    let attempts = 0;
    while (!spawned && attempts < 100) {
        attempts++;
        const angle = Math.random() * Math.PI * 2;
        const dist = minRadius + Math.random() * (maxRadius - minRadius);
        const testX = playerX + Math.cos(angle) * dist;
        const testY = playerY + Math.sin(angle) * dist;
        const gridPos = grid.worldToGrid(testX, testY);
        if (gridPos.col >= 0 && gridPos.col < grid.cols && gridPos.row >= 0 && gridPos.row < grid.rows) {
            const idx = gridPos.row * grid.cols + gridPos.col;
            if (grid.grid[idx] !== 1) {
                const { x: centerX, y: centerY } = grid.gridToWorld(gridPos.col, gridPos.row);
                state.pickups.push(new Pickup(centerX, centerY, type));
                spawned = true;
            }
        }
    }
}

export function spawnInitialPickups(state, playerX, playerY) {
    if (!state.discoveredAbilities.has("Laser")) {
        spawnPickup(state, playerX, playerY, pickupSpawnSettings.coinMinRadius, pickupSpawnSettings.coinMaxRadius, "coin");
    }
    spawnPickup(state, playerX, playerY, pickupSpawnSettings.eyeballMinRadius, pickupSpawnSettings.eyeballMaxRadius, "eyeball");

    const numBarrels = pickupSpawnSettings.barrelMinCount + Math.floor(Math.random() * pickupSpawnSettings.barrelRandomRange);
    for (let i = 0; i < numBarrels; i++) {
        spawnPickup(state, playerX, playerY, pickupSpawnSettings.barrelMinRadius, pickupSpawnSettings.barrelMaxRadius, "barrel");
    }

    const numCrates = pickupSpawnSettings.crateMinCount + Math.floor(Math.random() * pickupSpawnSettings.crateRandomRange);
    for (let i = 0; i < numCrates; i++) {
        spawnPickup(state, playerX, playerY, pickupSpawnSettings.crateMinRadius, pickupSpawnSettings.crateMaxRadius, "crate");
    }
}
