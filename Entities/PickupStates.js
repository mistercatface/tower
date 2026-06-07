import { Explosion } from "./Explosion/Explosion.js";
function spawnExplosion(gameState, x, y, config) {
    if (!gameState || !config?.type) return;
    if (!gameState.explosions) gameState.explosions = [];
    gameState.explosions.push(new Explosion(x, y, config.type, config));
}
function getBurnSettings(pickup) {
    const def = pickup.strategy;
    const maxHealth = def?.maxHealth ?? 3;
    const burnDurationMs = def?.onFire?.burnDurationMs ?? 2000;
    return { maxHealth, burnDurationMs };
}
export class PickupNormalState {
    getRender3DKey(pickup) {
        return pickup.strategy.render3DKey;
    }
}
export class PickupOnFireState {
    blocksSleep() {
        return true;
    }
    onEnter(pickup) {
        const { maxHealth, burnDurationMs } = getBurnSettings(pickup);
        pickup.maxHealth = maxHealth;
        pickup.health = maxHealth;
        pickup.stateTimer = burnDurationMs;
    }
    getRender3DKey(pickup) {
        return pickup.strategy.onFireRender3DKey ?? `fire_${pickup.strategy.render3DKey}`;
    }
    update(pickup, dt, walls, state) {
        const { burnDurationMs } = getBurnSettings(pickup);
        pickup.stateTimer -= dt;
        pickup.health -= pickup.maxHealth * (dt / burnDurationMs);
        if (pickup.health <= 0 || pickup.stateTimer <= 0) {
            pickup.health = 0;
            pickup.changeState("exploded", { gameState: state });
        }
    }
}
export class PickupShardFlyingState {
    blocksSleep() {
        return true;
    }
    onEnter(pickup) {
        pickup.stateTimer = 15000; // 14500ms wait + 500ms fade out
        pickup.opacity = 1.0;
        pickup.angularVelocity = (Math.random() - 0.5) * 8;
    }
    update(pickup, dt, walls, state) {
        pickup.stateTimer -= dt;
        if (pickup.stateTimer <= 0) pickup.isDead = true;
        else if (pickup.stateTimer < 500) pickup.opacity = pickup.stateTimer / 500;
    }
}
export class PickupExplodedState {
    onEnter(pickup) {
        pickup.isDead = true;
        const gameState = pickup.stateData.gameState;
        if (pickup.strategy.splittable && typeof pickup.spawnShards === "function") pickup.spawnShards(gameState);
        else spawnExplosion(gameState, pickup.x, pickup.y, pickup.strategy?.explosion);
    }
}
export class PickupSinkingState {
    blocksSleep() {
        return true;
    }
    get disablePhysics() {
        return false;
    }
    get disableWallCollision() {
        return false;
    }
    onEnter(pickup) {
        pickup.elevation = 0;
        pickup.elevationVelocity = 0;
    }
    onExit(pickup) {
        pickup.elevation = 0;
        pickup.elevationVelocity = 0;
        pickup.opacity = 1.0;
        delete pickup.sinkingCaptured;
        delete pickup.tableCenterX;
        delete pickup.tableCenterY;
    }
    update(pickup, dt, walls, state) {
        const captured = pickup.sinkingCaptured ?? false;
        // Apply vertical gravity (downward: -600 units/s^2 if captured, -350 if not)
        const gravity = captured ? -600 : -350;
        pickup.elevationVelocity = (pickup.elevationVelocity ?? 0) + gravity * (dt / 1000);
        pickup.elevation = (pickup.elevation ?? 0) + pickup.elevationVelocity * (dt / 1000);
        // Fade out once the ball drops below the table surface (elevation <= -radius)
        const radius = pickup.radius ?? 8;
        const pocketDepth = pickup.pocketDepth ?? 24;
        const fadeStart = -radius;
        const fadeEnd = -pocketDepth;
        if (pickup.elevation > fadeStart) {
            pickup.opacity = 1.0;
        } else {
            pickup.opacity = Math.max(0, Math.min(1.0, 1.0 - (pickup.elevation - fadeStart) / (fadeEnd - fadeStart)));
        }
        // Apply horizontal funnel gravity pulling towards the pocket center
        if (pickup.pocketX != null && pickup.pocketY != null) {
            const dx = pickup.pocketX - pickup.x;
            const dy = pickup.pocketY - pickup.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0.001) {
                const pullForce = captured ? 500 : 200; // stronger pull if captured
                pickup.vx += (dx / dist) * pullForce * (dt / 1000);
                pickup.vy += (dy / dist) * pullForce * (dt / 1000);
            }
        }
        // Prevent overshoot/bounce back onto the table once captured
        if (captured && pickup.pocketX != null && pickup.pocketY != null && pickup.tableCenterX != null && pickup.tableCenterY != null) {
            const dx = pickup.pocketX - pickup.x;
            const dy = pickup.pocketY - pickup.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0.001) {
                // Vector from pocket center to ball
                const pbx = pickup.x - pickup.pocketX;
                const pby = pickup.y - pickup.pocketY;
                // Vector from pocket center to table center
                const tcX = pickup.tableCenterX - pickup.pocketX;
                const tcY = pickup.tableCenterY - pickup.pocketY;
                // Dot product to check if ball is on the table side of the pocket center
                const isTableSide = pbx * tcX + pby * tcY > 0;
                // Vector pointing towards pocket center
                const toCenterX = dx / dist;
                const toCenterY = dy / dist;
                // Project velocity onto to-center vector (negative means moving away from pocket center)
                const isMovingAway = pickup.vx * toCenterX + pickup.vy * toCenterY < 0;
                if (isTableSide && isMovingAway) {
                    // Damp velocity heavily to trap the ball inside the pocket cup
                    pickup.vx *= 0.05;
                    pickup.vy *= 0.05;
                }
            }
        }
        // Apply pocket lining damping (friction coefficient: 8.0 if captured, 3.5 if not)
        const friction = captured ? 8.0 : 3.5;
        const dampingFactor = Math.exp(-friction * (dt / 1000));
        pickup.vx *= dampingFactor;
        pickup.vy *= dampingFactor;
    }
}
export const pickupStates = {
    normal: new PickupNormalState(),
    on_fire: new PickupOnFireState(),
    exploded: new PickupExplodedState(),
    shard_flying: new PickupShardFlyingState(),
    sinking: new PickupSinkingState(),
};
