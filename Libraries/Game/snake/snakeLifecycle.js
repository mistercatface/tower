import { getSandboxEntityMeta } from "../../../GameState/sandboxEntityMeta.js";
import { clearGroundRollDrive } from "../../Sandbox/kineticRollActuator.js";
import { createSnakeGoalIndex, rebuildSnakeGoalIndex } from "./snakeGoalIndex.js";
import { clearSnakeSteeringLeaseFromProp } from "./snakeSteeringLease.js";
export function retireSnakeSegmentsFromNav(state, memberIds) {
    const meta = getSandboxEntityMeta(state);
    for (let i = 0; i < memberIds.length; i++) {
        const prop = state.entityRegistry.get(memberIds[i]);
        if (!prop) continue;
        meta.setChainHead(memberIds[i], false);
        if (prop._snakeSteering) clearSnakeSteeringLeaseFromProp(prop);
        else clearGroundRollDrive(prop);
        prop.navStepPenalty = null;
    }
}
export function wireSnakeGameRegistry(state, registry, autosimsByHeadId, navWalkable) {
    state.sandbox.snakeGame = { registry, autosimsByHeadId, instancesByHeadId: new Map(), navWalkable, goalIndex: createSnakeGoalIndex(), simTick: 0, lastVisionBeginTick: -1 };
    rebuildSnakeGoalIndex(state);
}
export function createSnakeLifecycleRegistry() {
    return { aliveByHeadId: new Map(), inertByLeadId: new Map(), deadHeadIds: new Set() };
}
export function registerAliveSnake(registry, headId) {
    registry.aliveByHeadId.set(headId, { headId, lifecycle: "alive" });
    registry.deadHeadIds.delete(headId);
}
export function registerInertSnake(registry, leadSegmentId, memberIds, sourceHeadId) {
    registry.inertByLeadId.set(leadSegmentId, { leadSegmentId, memberIds, sourceHeadId, lifecycle: "inert" });
}
export function markSnakeDead(registry, headId) {
    registry.aliveByHeadId.delete(headId);
    registry.deadHeadIds.add(headId);
}
export function isAliveSnakeHead(registry, headId) {
    return registry.aliveByHeadId.has(headId);
}
export function purgeInertSnakesForHead(registry, headId) {
    for (const [leadId, entry] of registry.inertByLeadId) if (entry.sourceHeadId === headId) registry.inertByLeadId.delete(leadId);
}
