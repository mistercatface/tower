import { getConnectedComponentPath } from "../../Motion/kineticConstraintGraph.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { getSnakeSizeScore } from "./snakeScale.js";
import { getSnakeInstance, SnakeInstance } from "./SnakeInstance.js";
import { FleeAgentInstance } from "./fleeAgent/FleeAgentInstance.js";
export function buildAgentMemberToInstanceMap(state, snakeGame) {
    const map = new Map();
    for (const instance of snakeGame.instancesByHeadId.values()) {
        if (instance.lifecycle !== "alive") continue;
        const meta = snakeGame.registry.aliveByHeadId.get(instance.headId);
        const def = meta ? snakeGame.speciesById.get(meta.species) : null;
        const members = def?.syncMembers ? def.syncMembers(instance, state) : getConnectedComponentPath(state.kinetic, instance.headId);
        for (let i = 0; i < members.length; i++) map.set(members[i], instance);
    }
    return map;
}
import { resolveAgentRelationship } from "./snakeAgentSession.js";
import { kineticPairBodiesAt } from "../../Spatial/collision/kineticPairStream.js";
import { kineticDynamicSlab } from "../../Spatial/collision/kineticBodySlab.js";
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
    const nx = contacts.dynamic.nx[i];
    const ny = contacts.dynamic.ny[i];
    if (contacts.static.tier[i] === KINETIC_PAIR_TIER.CIRCLE_CIRCLE) {
        if (targetBody._physId === physIdB) return { x: kineticDynamicSlab.x[physIdB] + nx * kineticDynamicSlab.r[physIdB], y: kineticDynamicSlab.y[physIdB] + ny * kineticDynamicSlab.r[physIdB] };
        return { x: kineticDynamicSlab.x[physIdA] - nx * kineticDynamicSlab.r[physIdA], y: kineticDynamicSlab.y[physIdA] - ny * kineticDynamicSlab.r[physIdA] };
    }
    if (targetBody._physId === physIdB) return { x: kineticDynamicSlab.x[physIdB] + contacts.dynamic.rbx[i], y: kineticDynamicSlab.y[physIdB] + contacts.dynamic.rby[i] };
    return { x: kineticDynamicSlab.x[physIdA] + contacts.dynamic.rax[i], y: kineticDynamicSlab.y[physIdA] + contacts.dynamic.ray[i] };
}
export function snakeDeathImpactFromContact(spatialFrame, contacts, i, struckSegmentId, struckBody, impactForce = null) {
    const hit = contactWorldPointForBody(spatialFrame, contacts, i, struckBody);
    return { worldX: hit.x, worldY: hit.y, impactForce: impactForce ?? Math.hypot(contacts.dynamic.preDvx[i], contacts.dynamic.preDvy[i]), struckSegmentId, spatialFrame };
}
function fleeSnakeContactPair(instanceA, instanceB, bodyA, bodyB) {
    if (instanceA instanceof FleeAgentInstance && instanceB instanceof SnakeInstance) return { fleeInstance: instanceA, snakeInstance: instanceB, fleeBody: bodyA, snakeBody: bodyB };
    if (instanceB instanceof FleeAgentInstance && instanceA instanceof SnakeInstance) return { fleeInstance: instanceB, snakeInstance: instanceA, fleeBody: bodyB, snakeBody: bodyA };
    return null;
}
function tryResolveFleeEscapeRam(state, snakeGame, spatialFrame, contacts, i, fleeInstance, snakeInstance, fleeBody, snakeBody, relSpeed, config, splitLinks) {
    if (!fleeInstance.sprinting || relSpeed < config.splitImpulseThreshold) return false;
    if (fleeInstance.intent?.getMode?.() !== "flee") return false;
    if (fleeBody.id !== fleeInstance.headId || snakeBody.id === snakeInstance.headId) return false;
    const victimMembers = orderedMembers(state, snakeInstance.headId);
    const struckSegmentId = snakeBody.id;
    const strikeIndex = victimMembers.indexOf(struckSegmentId);
    if (strikeIndex < 0 || strikeIndex >= victimMembers.length - 1) return false;
    const linkKey = `${victimMembers[strikeIndex]}:${victimMembers[strikeIndex + 1]}`;
    if (splitLinks.has(linkKey)) return false;
    splitLinks.add(linkKey);
    const deathImpact = snakeDeathImpactFromContact(spatialFrame, contacts, i, struckSegmentId, snakeBody, relSpeed);
    splitSnakeAtStruckSegment(state, snakeGame, snakeInstance.headId, struckSegmentId, victimMembers, deathImpact);
    return true;
}
export function resolveSnakeCombatFromContacts(state, spatialFrame, contacts, snakeGame) {
    if (contacts.count === 0) return;
    const config = getSnakeGameConfig();
    const memberToInstance = buildAgentMemberToInstanceMap(state, snakeGame);
    const splitLinks = new Set();
    for (let i = 0; i < contacts.count; i++) {
        const pair = kineticPairBodiesAt(spatialFrame, contacts.physIdA[i], contacts.physIdB[i]);
        if (!pair) continue;
        const instanceA = memberToInstance.get(pair.bodyA.id);
        const instanceB = memberToInstance.get(pair.bodyB.id);
        if (!instanceA || !instanceB || instanceA === instanceB) continue;
        const relSpeed = Math.hypot(contacts.dynamic.preDvx[i], contacts.dynamic.preDvy[i]);
        const fleeSnakePair = fleeSnakeContactPair(instanceA, instanceB, pair.bodyA, pair.bodyB);
        if (
            fleeSnakePair &&
            tryResolveFleeEscapeRam(
                state,
                snakeGame,
                spatialFrame,
                contacts,
                i,
                fleeSnakePair.fleeInstance,
                fleeSnakePair.snakeInstance,
                fleeSnakePair.fleeBody,
                fleeSnakePair.snakeBody,
                relSpeed,
                config,
                splitLinks,
            )
        )
            continue;
        const relationshipAB = resolveAgentRelationship(snakeGame, instanceA.headId, instanceB.headId, state);
        const relationshipBA = resolveAgentRelationship(snakeGame, instanceB.headId, instanceA.headId, state);
        if (relationshipAB === "prey" || relationshipBA === "prey") {
            const predatorInstance = relationshipAB === "prey" ? instanceA : instanceB;
            const preyInstance = relationshipAB === "prey" ? instanceB : instanceA;
            const predatorBody = relationshipAB === "prey" ? pair.bodyA : pair.bodyB;
            const preyBody = relationshipAB === "prey" ? pair.bodyB : pair.bodyA;
            if (predatorBody.id === predatorInstance.headId && relSpeed >= config.splitImpulseThreshold) {
                const deathImpact = snakeDeathImpactFromContact(spatialFrame, contacts, i, preyBody.id, preyBody, relSpeed);
                preyInstance.die(state, snakeGame, null, deathImpact);
                continue;
            }
        }
        // Fall back to traditional snake-vs-snake combat
        if (!(instanceA instanceof SnakeInstance) || !(instanceB instanceof SnakeInstance)) continue;
        const snakeHeadA = instanceA.headId;
        const snakeHeadB = instanceB.headId;
        const membersA = orderedMembers(state, snakeHeadA);
        const membersB = orderedMembers(state, snakeHeadB);
        const sizeA = snakeSizeScore(state, snakeHeadA, membersA);
        const sizeB = snakeSizeScore(state, snakeHeadB, membersB);
        if (sizeA === sizeB) continue;
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
function restoreHunterContactDrive(hunterHead, hunterPhysId, preyTarget, speedOverride = null) {
    const dx = preyTarget.x - hunterHead.x;
    const dy = preyTarget.y - hunterHead.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 0) return;
    const speed = speedOverride ?? getSnakeGameConfig().headMaxSpeed ?? Math.hypot(kineticDynamicSlab.vx[hunterPhysId], kineticDynamicSlab.vy[hunterPhysId]);
    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;
    kineticDynamicSlab.vx[hunterPhysId] = vx;
    kineticDynamicSlab.vy[hunterPhysId] = vy;
    hunterHead.vx = vx;
    hunterHead.vy = vy;
}
function applySnakeHuntContactDriveForPair(state, snakeGame, hunterInstance, hunterBody, hunterPhysId, preyInstance) {
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
    const memberToInstance = buildAgentMemberToInstanceMap(state, snakeGame);
    for (let i = 0; i < contacts.count; i++) {
        const pair = kineticPairBodiesAt(spatialFrame, contacts.physIdA[i], contacts.physIdB[i]);
        if (!pair) continue;
        const instanceA = memberToInstance.get(pair.bodyA.id);
        const instanceB = memberToInstance.get(pair.bodyB.id);
        if (!instanceA || !instanceB || instanceA === instanceB) continue;
        applySnakeHuntContactDriveForPair(state, snakeGame, instanceA, pair.bodyA, contacts.physIdA[i], instanceB);
        applySnakeHuntContactDriveForPair(state, snakeGame, instanceB, pair.bodyB, contacts.physIdB[i], instanceA);
    }
}
