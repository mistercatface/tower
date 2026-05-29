import { Entity } from "./Entity.js";
import { Explosion } from "./Explosion/Explosion.js";
import { PhysicsSystem } from "../Spatial/Motion/PhysicsSystem.js";
import { worldPropDefinitions } from "../Config/PropDefinitions.js";

const PICKUP_STRATEGY_DEFAULTS = {
    isPushable: false,
    renderMode: "3d",
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

const HIT_BEHAVIORS = {
    none: () => false,
    explosive: explosiveOnHit,
    damage: damageOnHit,
};

const worldPropStrategies = Object.fromEntries(
    Object.entries(worldPropDefinitions).map(([type, def]) => {
        const { hitBehavior, spawn, ...strategyFields } = def;
        return [type, withPickupDefaults({
            ...strategyFields,
            isExplosive: hitBehavior === "explosive",
            onHit: HIT_BEHAVIORS[hitBehavior] ?? HIT_BEHAVIORS.none,
        })];
    })
);

export class Pickup extends Entity {
    constructor(x, y, type) {
        super(x, y, 0, false);
        this.type = type;
        this.strategy = worldPropStrategies[type];
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
    for (const [type, def] of Object.entries(worldPropDefinitions)) {
        const spawn = def.spawn;
        if (!spawn) continue;
        const count = spawn.minCount + Math.floor(Math.random() * spawn.randomRange);
        for (let i = 0; i < count; i++) {
            spawnPickup(state, playerX, playerY, spawn.minRadius, spawn.maxRadius, type);
        }
    }
}
