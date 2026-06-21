import { getConnectedComponentPath } from "../../Motion/kineticConstraintGraph.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { getSnakeSizeScore } from "./snakeScale.js";
import { getSnakeInstance, buildSnakeMemberToInstanceMap } from "./SnakeInstance.js";
import { retireSnakeSegmentsFromNav, sweepOrphanSnakeChains } from "./snakeLifecycle.js";
import { kineticPairBodiesAt } from "../../Spatial/collision/kineticPairStream.js";
function snakeSegmentCount(state, headId, members = null) {
    return (members || getConnectedComponentPath(state.kinetic, headId)).length;
}
function snakeSizeScore(state, headId, members = null) {
    return getSnakeSizeScore(state, headId, members);
}
function orderedMembers(state, headId) {
    return getConnectedComponentPath(state.kinetic, headId);
}
export function enforceSnakeMinLength(state, snakeGame, headId, members = null) {
    const config = getSnakeGameConfig();
    if (snakeSegmentCount(state, headId, members) >= config.minAliveSegmentCount) return false;
    killSnake(state, snakeGame, headId, members);
    return true;
}
export function killSnake(state, snakeGame, headId, members = null) {
    getSnakeInstance(snakeGame, headId).die(state, snakeGame, members);
}
export function splitSnakeAtStruckSegment(state, snakeGame, victimHeadId, struckSegmentId, victimMembers = null) {
    return getSnakeInstance(snakeGame, victimHeadId).splitAtStruckSegment(state, snakeGame, struckSegmentId, victimMembers);
}
export function resolveSnakeCombatFromContacts(state, spatialFrame, contacts, snakeGame) {
    if (contacts.count === 0) return;
    const config = getSnakeGameConfig();
    const memberToInstance = buildSnakeMemberToInstanceMap(state, snakeGame);
    const splitLinks = new Set();
    for (let i = 0; i < contacts.count; i++) {
        const pair = kineticPairBodiesAt(spatialFrame, contacts.physIdA[i], contacts.physIdB[i]);
        if (!pair) continue;
        const instanceA = memberToInstance.get(pair.bodyA.id);
        const instanceB = memberToInstance.get(pair.bodyB.id);
        if (!instanceA || !instanceB || instanceA === instanceB) continue;
        const snakeHeadA = instanceA.headId;
        const snakeHeadB = instanceB.headId;
        const membersA = orderedMembers(state, snakeHeadA);
        const membersB = orderedMembers(state, snakeHeadB);
        const sizeA = snakeSizeScore(state, snakeHeadA, membersA);
        const sizeB = snakeSizeScore(state, snakeHeadB, membersB);
        if (sizeA === sizeB) continue;
        const relSpeed = Math.hypot(contacts.preDvx[i], contacts.preDvy[i]);
        if (relSpeed < config.splitImpulseThreshold) continue;
        const largerHead = sizeA > sizeB ? snakeHeadA : snakeHeadB;
        const smallerHead = sizeA > sizeB ? snakeHeadB : snakeHeadA;
        const largerBody = sizeA > sizeB ? pair.bodyA : pair.bodyB;
        const smallerBody = sizeA > sizeB ? pair.bodyB : pair.bodyA;
        if (largerBody.id !== largerHead) continue;
        const victimMembers = orderedMembers(state, smallerHead);
        const struckSegmentId = smallerBody.id;
        const strikeIndex = victimMembers.indexOf(struckSegmentId);
        if (strikeIndex < 0 || strikeIndex >= victimMembers.length - 1) continue;
        const linkKey = `${victimMembers[strikeIndex]}:${victimMembers[strikeIndex + 1]}`;
        if (splitLinks.has(linkKey)) continue;
        splitLinks.add(linkKey);
        splitSnakeAtStruckSegment(state, snakeGame, smallerHead, struckSegmentId, victimMembers);
    }
}
export function syncSnakeGameLifecycle(state, snakeGame) {
    const registry = snakeGame.registry;
    for (const instance of snakeGame.instancesByHeadId.values()) instance.validate(state, snakeGame);
    for (const entry of registry.inertByLeadId.values()) retireSnakeSegmentsFromNav(state, entry.memberIds);
    sweepOrphanSnakeChains(state, snakeGame);
    for (const headId of [...snakeGame.autosimsByHeadId.keys()]) {
        if (registry.aliveByHeadId.has(headId)) continue;
        const instance = getSnakeInstance(snakeGame, headId);
        if (instance) instance.stopSteering(state);
        snakeGame.autosimsByHeadId.delete(headId);
    }
}
