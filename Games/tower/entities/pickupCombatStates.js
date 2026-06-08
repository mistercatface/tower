import { Explosion } from "./Explosion/Explosion.js";
import { RagdollCorpse } from "./RagdollCorpse.js";
import { clearActorKinematics } from "../../../Libraries/Render/Characters/actorKinematicsRenderer.js";
import { canSplittablePickupSplit } from "../../../Libraries/Props/splittable.js";
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
export class PickupExplodedState {
    onEnter(pickup) {
        pickup.isDead = true;
        const gameState = pickup.stateData.gameState;
        if (pickup.usesKinematicsBody && gameState) {
            const camera = pickup._kinematicsCamera ?? { x: pickup.x, y: pickup.y };
            RagdollCorpse.spawnFromActor(gameState, pickup, null, camera);
            clearActorKinematics(pickup);
        }
        if (canSplittablePickupSplit(pickup) && typeof pickup.spawnShards === "function") pickup.spawnShards(gameState);
        else spawnExplosion(gameState, pickup.x, pickup.y, pickup.strategy?.explosion);
    }
}
export const towerPickupStates = { on_fire: new PickupOnFireState(), exploded: new PickupExplodedState() };
