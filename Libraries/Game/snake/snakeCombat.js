import { getConnectedComponentPath } from "../../Motion/kineticConstraintGraph.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { getSnakeSizeScore } from "./snakeScale.js";
import { getSnakeInstance, buildSnakeMemberToInstanceMap } from "./SnakeInstance.js";
import { kineticPairBodiesAt } from "../../Spatial/collision/kineticPairStream.js";
import { kineticBodySlab } from "../../Spatial/collision/kineticBodySlab.js";
import { KINETIC_PAIR_TIER } from "../../Spatial/collision/kineticNarrowPhase.js";
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
export function killSnake(state, snakeGame, headId, members = null, deathImpact = null) {
    const instance = getSnakeInstance(snakeGame, headId);
    if (!instance) return null;
    instance.die(state, snakeGame, members, deathImpact);
    return instance;
}
export function splitSnakeAtStruckSegment(state, snakeGame, victimHeadId, struckSegmentId, victimMembers = null, deathImpact = null) {
    const instance = getSnakeInstance(snakeGame, victimHeadId);
    if (!instance) return null;
    return instance.splitAtStruckSegment(state, snakeGame, struckSegmentId, victimMembers, deathImpact);
}
function contactWorldPointForBody(spatialFrame, contacts, i, targetBody) {
    const physIdA = contacts.physIdA[i];
    const physIdB = contacts.physIdB[i];
    const nx = contacts.nx[i];
    const ny = contacts.ny[i];
    if (contacts.tier[i] === KINETIC_PAIR_TIER.CIRCLE_CIRCLE) {
        if (targetBody._physId === physIdB) return { x: kineticBodySlab.x[physIdB] + nx * kineticBodySlab.r[physIdB], y: kineticBodySlab.y[physIdB] + ny * kineticBodySlab.r[physIdB] };
        return { x: kineticBodySlab.x[physIdA] - nx * kineticBodySlab.r[physIdA], y: kineticBodySlab.y[physIdA] - ny * kineticBodySlab.r[physIdA] };
    }
    if (targetBody._physId === physIdB) return { x: kineticBodySlab.x[physIdB] + contacts.rbx[i], y: kineticBodySlab.y[physIdB] + contacts.rby[i] };
    return { x: kineticBodySlab.x[physIdA] + contacts.rax[i], y: kineticBodySlab.y[physIdA] + contacts.ray[i] };
}
export function snakeDeathImpactFromContact(spatialFrame, contacts, i, struckSegmentId, struckBody, impactForce = null) {
    const hit = contactWorldPointForBody(spatialFrame, contacts, i, struckBody);
    return { worldX: hit.x, worldY: hit.y, impactForce: impactForce ?? Math.hypot(contacts.preDvx[i], contacts.preDvy[i]), struckSegmentId, spatialFrame };
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
        const deathImpact = snakeDeathImpactFromContact(spatialFrame, contacts, i, struckSegmentId, smallerBody, relSpeed);
        splitSnakeAtStruckSegment(state, snakeGame, smallerHead, struckSegmentId, victimMembers, deathImpact);
    }
}
function restoreHunterContactDrive(hunterHead, hunterPhysId, preyHead) {
    const dx = preyHead.x - hunterHead.x;
    const dy = preyHead.y - hunterHead.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 0) return;
    const speed = getSnakeGameConfig().headMaxSpeed ?? Math.hypot(kineticBodySlab.vx[hunterPhysId], kineticBodySlab.vy[hunterPhysId]);
    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;
    kineticBodySlab.vx[hunterPhysId] = vx;
    kineticBodySlab.vy[hunterPhysId] = vy;
    hunterHead.vx = vx;
    hunterHead.vy = vy;
}
function applyHuntContactDriveForPair(state, snakeGame, hunterInstance, hunterBody, hunterPhysId, preyInstance) {
    if (hunterBody.id !== hunterInstance.headId) return;
    const autosim = snakeGame.autosimsByHeadId.get(hunterInstance.headId);
    if (autosim?.getMode?.() !== "seek_prey") return;
    if (autosim.getTargetId?.() !== preyInstance.headId) return;
    const preyHead = state.entityRegistry.getLive(preyInstance.headId);
    if (!preyHead) return;
    restoreHunterContactDrive(hunterBody, hunterPhysId, preyHead);
}
export function applySnakeHuntContactDrive(state, spatialFrame, contacts, snakeGame) {
    if (contacts.count === 0) return;
    const memberToInstance = buildSnakeMemberToInstanceMap(state, snakeGame);
    for (let i = 0; i < contacts.count; i++) {
        const pair = kineticPairBodiesAt(spatialFrame, contacts.physIdA[i], contacts.physIdB[i]);
        if (!pair) continue;
        const instanceA = memberToInstance.get(pair.bodyA.id);
        const instanceB = memberToInstance.get(pair.bodyB.id);
        if (!instanceA || !instanceB || instanceA === instanceB) continue;
        applyHuntContactDriveForPair(state, snakeGame, instanceA, pair.bodyA, contacts.physIdA[i], instanceB);
        applyHuntContactDriveForPair(state, snakeGame, instanceB, pair.bodyB, contacts.physIdB[i], instanceA);
    }
}
