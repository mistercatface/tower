import { Explosion } from "./Explosion/Explosion.js";

function spawnExplosion(gameState, x, y, config) {
    if (!gameState || !config?.type) return;
    if (!gameState.explosions) gameState.explosions = [];
    gameState.explosions.push(new Explosion(x, y, config.type, config));
}

export class PickupNormalState {
    getRender3DKey(pickup) {
        return pickup.strategy.render3DKey;
    }
}

export class PickupOnFireState {
    onEnter(pickup) {
        pickup.maxHealth = 15;
        pickup.health = 15;
        pickup.stateTimer = 2000;
    }

    getRender3DKey() {
        return "fire_barrel";
    }

    update(pickup, dt, walls, state) {
        pickup.stateTimer -= dt;
        pickup.health -= 15 * (dt / 2000);
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
