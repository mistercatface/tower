import { getSandboxEntityMeta } from "../../../GameState/sandboxEntityMeta.js";
import { removeChainLinkBetween, clearChainLinksForMembers } from "../../Sandbox/chainLinks.js";
import { getConnectedComponentPath } from "../../Motion/kineticConstraintGraph.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { getSnakeSizeScore } from "./snakeScale.js";
import { markSnakeDead, registerInertSnake, retireSnakeSegmentsFromNav } from "./snakeLifecycle.js";
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
    const meta = getSandboxEntityMeta(state);
    const resolvedMembers = members || orderedMembers(state, headId);
    for (let i = 0; i < resolvedMembers.length; i++) meta.setChainHead(resolvedMembers[i], false);
    retireSnakeSegmentsFromNav(state, resolvedMembers);
    clearChainLinksForMembers(state, resolvedMembers);
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
    const meta = getSandboxEntityMeta(state);
    for (let i = 0; i < tailIds.length; i++) meta.setChainHead(tailIds[i], false);
    retireSnakeSegmentsFromNav(state, tailIds);
    registerInertSnake(snakeGame.registry, tailIds[0], tailIds);
    enforceSnakeMinLength(state, snakeGame, victimHeadId);
    return { aliveHeadId: victimHeadId, aliveIds, inertLeadId: tailIds[0], inertIds: tailIds };
}
export function resolveSnakeCombatFromContacts(state, spatialFrame, contacts, snakeGame) {
    if (contacts.count === 0) return;
    snakeGame._lastCombatContactCount = contacts.count;
    const config = getSnakeGameConfig();
    const registry = snakeGame.registry;
    const splitLinks = new Set();
    for (let i = 0; i < contacts.count; i++) {
        const pair = kineticPairBodiesAt(spatialFrame, contacts.physIdA[i], contacts.physIdB[i]);
        if (!pair) continue;
        const { bodyA, bodyB } = pair;
        const headA = bodyA.id;
        const headB = bodyB.id;
        if (!registry.aliveByHeadId.has(headA) || !registry.aliveByHeadId.has(headB) || headA === headB) continue;
        const membersA = orderedMembers(state, headA);
        const membersB = orderedMembers(state, headB);
        const sizeA = snakeSizeScore(state, headA, membersA);
        const sizeB = snakeSizeScore(state, headB, membersB);
        if (sizeA === sizeB) continue;
        const smallerWins = sizeA > sizeB;
        const victimHead = smallerWins ? headB : headA;
        const victimMembers = smallerWins ? membersB : membersA;
        const victimBodyId = victimHead;
        const relSpeed = Math.hypot(contacts.preDvx[i], contacts.preDvy[i]);
        if (relSpeed < config.splitImpulseThreshold) continue;
        const strikeIndex = victimMembers.indexOf(victimBodyId);
        if (strikeIndex < 0 || strikeIndex >= victimMembers.length - 1) continue;
        const linkKey = `${victimMembers[strikeIndex]}:${victimMembers[strikeIndex + 1]}`;
        if (splitLinks.has(linkKey)) continue;
        splitLinks.add(linkKey);
        splitSnakeAtStruckSegment(state, snakeGame, victimHead, victimBodyId, victimMembers);
    }
}
