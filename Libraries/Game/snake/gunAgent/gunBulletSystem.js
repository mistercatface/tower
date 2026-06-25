import { getPropCategoryIndex } from "../../../../GameState/SandboxWorldState.js";
import { removeSandboxWorldProp } from "../../../Sandbox/sandboxPlacedSpawn.js";
import { kineticPairBodiesAt } from "../../../Spatial/collision/kineticPairStream.js";
import { resolveAliveAgentInstanceFromProp } from "../resolveAliveAgentInstanceFromProp.js";
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
export function resolveGunBulletContacts(state, spatialFrame, contacts) {
    if (contacts.count === 0) return;
    for (let i = 0; i < contacts.count; i++) {
        const pair = kineticPairBodiesAt(spatialFrame, contacts.physIdA[i], contacts.physIdB[i]);
        if (!pair) continue;
        const bodyA = pair.bodyA;
        const bodyB = pair.bodyB;
        const isBulletA = !!(bodyA && bodyA._gunBullet && bodyA._armed);
        const isBulletB = !!(bodyB && bodyB._gunBullet && bodyB._armed);
        if (!isBulletA && !isBulletB) continue;
        const bullet = isBulletA ? bodyA : bodyB;
        const victim = isBulletA ? bodyB : bodyA;
        if (!victim) continue;
        // Find if victim resolves to an agent
        const victimInstance = resolveAliveAgentInstanceFromProp(state, victim.id);
        if (!victimInstance) continue;
        // If victim matches bullet shooter, ignore
        if (victimInstance.headId === bullet._shooterHeadId) continue;
        // Kill victim
        const relSpeed = Math.hypot(contacts.dynamic.preDvx[i], contacts.dynamic.preDvy[i]);
        const deathImpact = { worldX: victim.x, worldY: victim.y, impactForce: relSpeed, struckSegmentId: victim.id, spatialFrame };
        victimInstance.die(state, null, deathImpact);
        // Mark bullet spent
        bullet._armed = false;
    }
}
