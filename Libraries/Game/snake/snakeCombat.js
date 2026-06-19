import { getSandboxEntityMeta } from "../../../GameState/sandboxEntityMeta.js";
import { getOrderedChainMemberIds, removeChainLinkBetween, clearChainLinksForMembers } from "../../Sandbox/chainLinks.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { getSnakeSizeScore } from "./snakeScale.js";
import { markSnakeDead, registerInertSnake, resolveAliveSnakeHeadId } from "./snakeLifecycle.js";
import { kineticPairBodyAt } from "../../Spatial/collision/kineticPairStream.js";
function snakeSegmentCount(state, headId) {
    return getOrderedChainMemberIds(state, headId).length;
}
function snakeSizeScore(state, headId) {
    return getSnakeSizeScore(state, headId);
}
function orderedMembers(state, headId) {
    return getOrderedChainMemberIds(state, headId);
}
function resolveHead(registry, state, propId) {
    return resolveAliveSnakeHeadId(registry, (headId) => orderedMembers(state, headId), propId);
}
export function enforceSnakeMinLength(state, snakeGame, headId) {
    const config = getSnakeGameConfig();
    if (snakeSegmentCount(state, headId) >= config.minAliveSegmentCount) return false;
    killSnake(state, snakeGame, headId);
    return true;
}
export function killSnake(state, snakeGame, headId) {
    const autosim = snakeGame.autosimsByHeadId.get(headId);
    if (autosim) {
        autosim.stop();
        snakeGame.autosimsByHeadId.delete(headId);
    }
    const meta = getSandboxEntityMeta(state);
    const members = orderedMembers(state, headId);
    for (let i = 0; i < members.length; i++) meta.setChainHead(members[i], false);
    clearChainLinksForMembers(state, members);
    markSnakeDead(snakeGame.registry, headId);
}
export function splitSnakeAtStruckSegment(state, snakeGame, victimHeadId, struckSegmentId) {
    const members = orderedMembers(state, victimHeadId);
    const strikeIndex = members.indexOf(struckSegmentId);
    if (strikeIndex < 0 || strikeIndex >= members.length - 1) return null;
    const linkA = members[strikeIndex];
    const linkB = members[strikeIndex + 1];
    if (!removeChainLinkBetween(state, linkA, linkB)) return null;
    const aliveIds = members.slice(0, strikeIndex + 1);
    const tailIds = members.slice(strikeIndex + 1);
    const meta = getSandboxEntityMeta(state);
    for (let i = 0; i < tailIds.length; i++) meta.setChainHead(tailIds[i], false);
    registerInertSnake(snakeGame.registry, tailIds[0], tailIds);
    enforceSnakeMinLength(state, snakeGame, victimHeadId);
    return { aliveHeadId: victimHeadId, aliveIds, inertLeadId: tailIds[0], inertIds: tailIds };
}
export function resolveSnakeCombatFromContacts(state, spatialFrame, contacts, snakeGame) {
    if (!snakeGame || contacts.count === 0) return;
    const config = getSnakeGameConfig();
    const registry = snakeGame.registry;
    const splitLinks = new Set();
    for (let i = 0; i < contacts.count; i++) {
        const bodyA = kineticPairBodyAt(spatialFrame, contacts.physIdA[i]);
        const bodyB = kineticPairBodyAt(spatialFrame, contacts.physIdB[i]);
        const headA = resolveHead(registry, state, bodyA.id);
        const headB = resolveHead(registry, state, bodyB.id);
        if (headA == null || headB == null || headA === headB) continue;
        if (bodyA.id !== headA || bodyB.id !== headB) continue;
        const sizeA = snakeSizeScore(state, headA);
        const sizeB = snakeSizeScore(state, headB);
        if (sizeA === sizeB) continue;
        const victimHead = sizeA > sizeB ? headB : headA;
        const victimMembers = orderedMembers(state, victimHead);
        const victimBody = victimMembers.includes(bodyA.id) ? bodyA : bodyB;
        if (!victimMembers.includes(victimBody.id)) continue;
        const relSpeed = Math.hypot(contacts.preDvx[i], contacts.preDvy[i]);
        if (relSpeed < config.splitImpulseThreshold) continue;
        const members = orderedMembers(state, victimHead);
        const strikeIndex = members.indexOf(victimBody.id);
        if (strikeIndex < 0 || strikeIndex >= members.length - 1) continue;
        const linkKey = `${members[strikeIndex]}:${members[strikeIndex + 1]}`;
        if (splitLinks.has(linkKey)) continue;
        splitLinks.add(linkKey);
        splitSnakeAtStruckSegment(state, snakeGame, victimHead, victimBody.id);
    }
}
