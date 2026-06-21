import { removeChainLinkBetween, clearChainLinksForMembers } from "../../Sandbox/chainLinks.js";
import { getConnectedComponentPath } from "../../Motion/kineticConstraintGraph.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { getSnakeSizeScore } from "./snakeScale.js";
import {
    markSnakeDead,
    registerInertSnake,
    retireSnakeSegmentsFromNav,
    collectSnakeInstanceMemberIds,
    purgeInertSnakesForHead,
    isValidAliveSnakeHead,
    sweepOrphanSnakeChains,
    buildAliveSnakeMemberHeadMap,
} from "./snakeLifecycle.js";
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
    const autosim = snakeGame.autosimsByHeadId.get(headId);
    if (autosim) {
        autosim.stop();
        snakeGame.autosimsByHeadId.delete(headId);
    }
    const connectedMembers = members || orderedMembers(state, headId);
    const resolvedMembers = collectSnakeInstanceMemberIds(state, snakeGame, headId, connectedMembers);
    retireSnakeSegmentsFromNav(state, resolvedMembers);
    clearChainLinksForMembers(state, resolvedMembers);
    purgeInertSnakesForHead(snakeGame.registry, headId);
    markSnakeDead(snakeGame.registry, headId);
    if (snakeGame.onHeadDied) snakeGame.onHeadDied(headId);
}
export function splitSnakeAtStruckSegment(state, snakeGame, victimHeadId, struckSegmentId, victimMembers = null) {
    const members = victimMembers || orderedMembers(state, victimHeadId);
    const strikeIndex = members.indexOf(struckSegmentId);
    if (strikeIndex < 0 || strikeIndex >= members.length - 1) return null;
    const linkA = members[strikeIndex];
    const linkB = members[strikeIndex + 1];
    if (!removeChainLinkBetween(state, linkA, linkB)) return null;
    const aliveIds = members.slice(0, strikeIndex + 1);
    const tailIds = members.slice(strikeIndex + 1);
    retireSnakeSegmentsFromNav(state, tailIds);
    registerInertSnake(snakeGame.registry, tailIds[0], tailIds, victimHeadId);
    enforceSnakeMinLength(state, snakeGame, victimHeadId);
    return { aliveHeadId: victimHeadId, aliveIds, inertLeadId: tailIds[0], inertIds: tailIds };
}
export function resolveSnakeCombatFromContacts(state, spatialFrame, contacts, snakeGame) {
    if (contacts.count === 0) return;
    const config = getSnakeGameConfig();
    const registry = snakeGame.registry;
    const memberToHead = buildAliveSnakeMemberHeadMap(registry, (headId) => orderedMembers(state, headId));
    const splitLinks = new Set();
    for (let i = 0; i < contacts.count; i++) {
        const pair = kineticPairBodiesAt(spatialFrame, contacts.physIdA[i], contacts.physIdB[i]);
        if (!pair) continue;
        const snakeHeadA = memberToHead.get(pair.bodyA.id);
        const snakeHeadB = memberToHead.get(pair.bodyB.id);
        if (snakeHeadA == null || snakeHeadB == null || snakeHeadA === snakeHeadB) continue;
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
    for (const entry of registry.inertByLeadId.values()) retireSnakeSegmentsFromNav(state, entry.memberIds);
    for (const headId of [...registry.aliveByHeadId.keys()]) {
        if (isValidAliveSnakeHead(state, registry, headId)) continue;
        killSnake(state, snakeGame, headId);
    }
    sweepOrphanSnakeChains(state, snakeGame);
    for (const headId of [...snakeGame.autosimsByHeadId.keys()]) {
        if (registry.aliveByHeadId.has(headId)) continue;
        snakeGame.autosimsByHeadId.get(headId)?.stop?.();
        snakeGame.autosimsByHeadId.delete(headId);
    }
}
