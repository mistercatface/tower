import { Entity } from "./Entity.js";
import { PhysicsSystem } from "../Spatial/Motion/PhysicsSystem.js";
import { wallContextFromState } from "../Spatial/World/WallContext.js";
import { worldPropDefinitions } from "../Config/PropDefinitions.js";
import { CRATE_LABEL_VARIANTS, CRATE_LABEL_FACES } from "../Config/props/Crate.js";
import { transitionEntity } from "./EntityFsm.js";
import { pickupStates } from "./PickupStates.js";
import { getProjectileDamage } from "../Combat/impactDamage.js";
import { resolvePickupInspect } from "../Render/Inspector/InspectRegistry.js";

const PICKUP_STRATEGY_DEFAULTS = {
    isPushable: false,
    renderMode: "3d",
    render3DKey: null,
    inspectKey: null,
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

function explosiveOnHit(state, pickup, projectile, events) {
    if (projectile?.isExplosion) {
        pickup.explode(state);
        return true;
    }

    const dmg = projectile ? getProjectileDamage(projectile) : 0;
    pickup.takeDamage(dmg, state);
    if (projectile?.isDead !== undefined) projectile.isDead = true;
    return true;
}

function damageOnHit(state, pickup, projectile, events) {
    if (projectile?.isExplosion) {
        pickup.explode(state);
        return true;
    }

    const dmg = projectile?.damage ?? 0;
    pickup.takeDamage(dmg, state);
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
        this.facing = Math.random() * Math.PI * 2;
        if (type === "crate") {
            this.faceLabelVariants = Object.fromEntries(
                CRATE_LABEL_FACES.map((face) => [
                    face,
                    Math.floor(Math.random() * CRATE_LABEL_VARIANTS.length),
                ]),
            );
        }
        if (this.strategy.maxHealth != null) {
            this.maxHealth = this.strategy.maxHealth;
            this.health = this.strategy.maxHealth;
        }
        this.stateTimer = 0;
        this.stateData = {};
        this.changeState("normal");
    }

    changeState(stateName, stateDataInit = null) {
        transitionEntity(this, pickupStates, stateName, stateDataInit);
    }

    getRender3DKey() {
        if (this.currentState?.getRender3DKey) {
            return this.currentState.getRender3DKey(this);
        }
        return this.strategy.render3DKey;
    }

    resolveInspect() {
        return resolvePickupInspect(this);
    }

    takeDamage(amount, gameState) {
        if (this.maxHealth == null || this.isDead) return false;

        this.health -= amount;
        if (this.health <= 0) {
            this.health = 0;
            if (this.currentStateName === "normal" && this.type === "barrel") {
                this.changeState("on_fire");
            } else {
                this.changeState("exploded", { gameState });
                return true;
            }
        }
        return false;
    }

    explode(gameState) {
        if (this.isDead || this.currentStateName === "exploded") return;
        this.changeState("exploded", { gameState });
    }

    update(dt, state) {
        PhysicsSystem.applyFrictionAndDrag(this, dt, this.strategy.friction);
        const wallCtx = wallContextFromState(state);
        if (this.strategy.isPushable && wallCtx) {
            PhysicsSystem.resolveWallCollisions(this, wallCtx);
        }

        if (this.currentState?.update) {
            this.currentState.update(this, dt, state.walls, state);
        }
    }
}

export function spawnPickup(state, playerX, playerY, minRadius, maxRadius, type) {
    const grid = state.obstacleGrid;
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
