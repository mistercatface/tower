import { getSandboxEntityMeta } from "../../../../GameState/sandboxEntityMeta.js";
export function findNearestEligibleMountBall(horn, state, registry, { bodyPropId, acquireRange, preferSpawnGroupId = null }) {
    const meta = getSandboxEntityMeta(state);
    let best = null;
    let bestDist = acquireRange;
    for (const [headId, alive] of registry.aliveByHeadId) {
        if (alive.species !== "flee_agent") continue;
        const ball = state.entityRegistry.getLive(headId);
        if (!ball || ball.isDead || ball.type !== bodyPropId) continue;
        if (preferSpawnGroupId && meta.getSpawnGroupId(ball.id) !== preferSpawnGroupId) continue;
        const dist = Math.hypot(ball.x - horn.x, ball.y - horn.y);
        if (dist > acquireRange) continue;
        if (!best || dist < bestDist) {
            best = ball;
            bestDist = dist;
        }
    }
    return best;
}
export function perceiveHornSatelliteWorld(horn, instance, state, registry, hornConfig) {
    if (instance.mountBallId) {
        const mount = state.entityRegistry.getLive(instance.mountBallId);
        if (mount && !mount.isDead) return { mountBall: mount };
        return { mountBall: null };
    }
    const mountBall = findNearestEligibleMountBall(horn, state, registry, { bodyPropId: hornConfig.bodyPropId, acquireRange: hornConfig.acquireRange, preferSpawnGroupId: instance.spawnGroupId });
    return { mountBall };
}
