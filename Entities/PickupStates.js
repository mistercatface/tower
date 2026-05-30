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
    onEnter(pickup) {
        const { maxHealth, burnDurationMs } = getBurnSettings(pickup);
        pickup.maxHealth = maxHealth;
        pickup.health = maxHealth;
        pickup.stateTimer = burnDurationMs;
    }

    getRender3DKey() {
        return "fire_barrel";
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

export class PickupExplodedState {
    onEnter(pickup) {
        pickup.isDead = true;
        const gameState = pickup.stateData.gameState;
        spawnExplosion(gameState, pickup.x, pickup.y, pickup.strategy?.explosion);
    }
}

export const pickupStates = {
    normal: new PickupNormalState(),
    on_fire: new PickupOnFireState(),
    exploded: new PickupExplodedState(),
};
