import { kineticPairBodiesAt } from "../../../Spatial/collision/kineticPairStream.js";
import { resolveAliveAgentInstanceFromProp } from "../resolveAliveAgentInstanceFromProp.js";
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
