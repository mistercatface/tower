import { getPropCategoryIndex } from "../../../../GameState/SandboxWorldState.js";
import { removeSandboxWorldProp } from "../../../Sandbox/sandboxPlacedSpawn.js";
export function tickGunBullets(state, dtMs) {
    const snakeGame = state.sandbox.snakeGame;
    if (!snakeGame || !snakeGame.activeGunBulletIds) return;
    const activeIds = snakeGame.activeGunBulletIds;
    for (let i = activeIds.length - 1; i >= 0; i--) {
        const id = activeIds[i];
        const bullet = state.entityRegistry.getLive(id);
        if (!bullet) {
            // Bullet was removed/destroyed
            activeIds[i] = activeIds[activeIds.length - 1];
            activeIds.pop();
            continue;
        }
        // Update lifetime or speed
        bullet._lifetimeMs = (bullet._lifetimeMs ?? 0) + dtMs;
        const speedSq = bullet.vx * bullet.vx + bullet.vy * bullet.vy;
        const maxLifetime = 3000;
        const speedThresholdSq = 50 * 50;
        if (!bullet._armed || bullet._lifetimeMs > maxLifetime || speedSq < speedThresholdSq) {
            bullet._armed = false;
            // Remove from active list
            activeIds[i] = activeIds[activeIds.length - 1];
            activeIds.pop();
            // Register as food
            state.entityRegistry.register("food", bullet);
            getPropCategoryIndex(state, "food").register(bullet);
            // Cap total spent bullets
            if (!snakeGame.spentGunBulletIds) snakeGame.spentGunBulletIds = [];
            snakeGame.spentGunBulletIds.push(bullet.id);
            const maxSpent = 50;
            while (snakeGame.spentGunBulletIds.length > maxSpent) {
                const oldestId = snakeGame.spentGunBulletIds.shift();
                const oldestBullet = state.entityRegistry.getLive(oldestId);
                if (oldestBullet && !oldestBullet.isDead) removeSandboxWorldProp(state, oldestBullet);
            }
        }
    }
}
