import { getConnectedComponentPath, getLinearChainOrderedMembers } from "../../Motion/kineticConstraintGraph.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { AGENT_PROFILE, getAgentProfile } from "../../AI/agents/agentProfile.js";
import { getAgentInstance } from "./AgentInstance.js";
import { getInstanceCombatTraits, isChainCombatTopology, matchesBrainRamResolver, shouldSkipPreyHeadRamKill } from "./agentCombatTraits.js";
import { resolveAgentRelationship } from "./snakeAgentSession.js";
import { kineticPairBodiesAt } from "../../Spatial/collision/kineticPairStream.js";
import { kineticDynamicSlab } from "../../Spatial/collision/kineticBodySlab.js";
import { KINETIC_PAIR_TIER } from "../../Spatial/collision/kineticNarrowPhase.js";
function buildAgentMemberToInstanceMap(state, snakeGame) {
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
function snakeSegmentCount(state, headId, members = null) {
    return (members || getConnectedComponentPath(state.kinetic, headId)).length;
}
function orderedMembers(state, headId) {
    return getLinearChainOrderedMembers(state.kinetic, headId);
}
export function enforceSnakeMinLength(state, snakeGame, headId, members = null) {
    const snake = getAgentProfile(AGENT_PROFILE.snake);
    if (snakeSegmentCount(state, headId, members) >= snake.minAliveSegmentCount) return false;
    killSnake(state, snakeGame, headId, members);
    return true;
}
export function killSnake(state, snakeGame, headId, members = null, deathImpact = null) {
    const instance = getAgentInstance(snakeGame, headId);
    if (!instance || !isChainCombatTopology(getInstanceCombatTraits(instance))) return null;
    instance.die(state, snakeGame, members, deathImpact);
    return instance;
}
export function splitSnakeAtStruckSegment(state, snakeGame, victimHeadId, struckSegmentId, victimMembers = null, deathImpact = null) {
    const instance = getAgentInstance(snakeGame, victimHeadId);
    if (!instance?.splitAtStruckSegment) return null;
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
function snakeDeathImpactFromContact(spatialFrame, contacts, i, struckSegmentId, struckBody, impactForce = null) {
    const hit = contactWorldPointForBody(spatialFrame, contacts, i, struckBody);
    return { worldX: hit.x, worldY: hit.y, impactForce: impactForce ?? Math.hypot(contacts.dynamic.preDvx[i], contacts.dynamic.preDvy[i]), struckSegmentId, spatialFrame };
}
function headDistSq(state, headIdA, headIdB) {
    const headA = state.entityRegistry.getLive(headIdA);
    const headB = state.entityRegistry.getLive(headIdB);
    if (!headA || !headB) return null;
    const dx = headA.x - headB.x;
    const dy = headA.y - headB.y;
    return dx * dx + dy * dy;
}
function fleeChainContactPair(instanceA, traitsA, instanceB, traitsB, bodyA, bodyB) {
    if (traitsA.fleeEscapeRam && isChainCombatTopology(traitsB)) return { fleeInstance: instanceA, chainInstance: instanceB, fleeBody: bodyA, chainBody: bodyB };
    if (traitsB.fleeEscapeRam && isChainCombatTopology(traitsA)) return { fleeInstance: instanceB, chainInstance: instanceA, fleeBody: bodyB, chainBody: bodyA };
    return null;
}
function classifyFleeRamVictims(contacts, i) {
    const nx = contacts.dynamic.nx[i];
    const ny = contacts.dynamic.ny[i];
    const attackA = contacts.dynamic.preVxA[i] * nx + contacts.dynamic.preVyA[i] * ny;
    const attackB = -(contacts.dynamic.preVxB[i] * nx + contacts.dynamic.preVyB[i] * ny);
    if (attackA > 0 && attackB > 0) return { killA: true, killB: true };
    if (attackA > attackB) return { killA: false, killB: true };
    if (attackB > attackA) return { killA: true, killB: false };
    return { killA: true, killB: true };
}
function areSameFleeFaction(bodyA, bodyB) {
    return bodyA.faction != null && bodyA.faction === bodyB.faction;
}
function areTeammates(snakeGame, headIdA, headIdB, state) {
    if (resolveAgentRelationship(snakeGame, headIdA, headIdB, state) === "ally") return true;
    const headA = state.entityRegistry.getLive(headIdA);
    const headB = state.entityRegistry.getLive(headIdB);
    return headA?.faction != null && headA.faction === headB?.faction;
}
function tryResolveFleeBallHeadRam(state, snakeGame, spatialFrame, contacts, i, instanceA, traitsA, instanceB, traitsB, bodyA, bodyB, relSpeed) {
    if (!traitsA.fleeBallHeadRam || !traitsB.fleeBallHeadRam) return false;
    if (bodyA.id !== instanceA.headId || bodyB.id !== instanceB.headId) return false;
    if (areSameFleeFaction(bodyA, bodyB)) return false;
    const victims = classifyFleeRamVictims(contacts, i);
    if (victims.killA) {
        const impactA = snakeDeathImpactFromContact(spatialFrame, contacts, i, bodyA.id, bodyA, relSpeed);
        instanceA.die(state, snakeGame, null, impactA);
    }
    if (victims.killB) {
        const impactB = snakeDeathImpactFromContact(spatialFrame, contacts, i, bodyB.id, bodyB, relSpeed);
        instanceB.die(state, snakeGame, null, impactB);
    }
    return true;
}
function tryResolveFleeEscapeRam(state, snakeGame, spatialFrame, contacts, i, fleeInstance, chainInstance, chainTraits, fleeBody, chainBody, relSpeed, config, splitLinks) {
    if (!chainTraits.victimOfFleeEscapeRam) return false;
    if (areTeammates(snakeGame, fleeInstance.headId, chainInstance.headId, state)) return false;
    if (!fleeInstance.sprinting || relSpeed < config.splitImpulseThreshold) return false;
    if (fleeInstance.intent?.getMode?.() !== "flee") return false;
    if (fleeBody.id !== fleeInstance.headId || chainBody.id === chainInstance.headId) return false;
    const victimMembers = orderedMembers(state, chainInstance.headId);
    const struckSegmentId = chainBody.id;
    const strikeIndex = victimMembers.indexOf(struckSegmentId);
    if (strikeIndex < 0 || strikeIndex >= victimMembers.length - 1) return false;
    const linkKey = `${victimMembers[strikeIndex]}:${victimMembers[strikeIndex + 1]}`;
    if (splitLinks.has(linkKey)) return false;
    splitLinks.add(linkKey);
    const deathImpact = snakeDeathImpactFromContact(spatialFrame, contacts, i, struckSegmentId, chainBody, relSpeed);
    splitSnakeAtStruckSegment(state, snakeGame, chainInstance.headId, struckSegmentId, victimMembers, deathImpact);
    return true;
}
function tryResolveBrainRam(state, snakeGame, spatialFrame, contacts, i, instanceA, traitsA, instanceB, traitsB, bodyA, bodyB, relSpeed, config, resolverId) {
    if (!matchesBrainRamResolver(traitsA, resolverId) || !matchesBrainRamResolver(traitsB, resolverId)) return false;
    if (areTeammates(snakeGame, instanceA.headId, instanceB.headId, state)) return false;
    if (relSpeed < config.splitImpulseThreshold) return false;
    const aLeader = bodyA.id === instanceA.headId;
    const bLeader = bodyB.id === instanceB.headId;
    if (!aLeader && !bLeader) return false;
    if (aLeader && bLeader) {
        const victims = classifyFleeRamVictims(contacts, i);
        if (victims.killA) {
            const impactA = snakeDeathImpactFromContact(spatialFrame, contacts, i, bodyA.id, bodyA, relSpeed);
            instanceA.die(state, snakeGame, null, impactA);
        }
        if (victims.killB) {
            const impactB = snakeDeathImpactFromContact(spatialFrame, contacts, i, bodyB.id, bodyB, relSpeed);
            instanceB.die(state, snakeGame, null, impactB);
        }
        return victims.killA || victims.killB;
    }
    if (aLeader) {
        const deathImpact = snakeDeathImpactFromContact(spatialFrame, contacts, i, bodyB.id, bodyB, relSpeed);
        instanceB.die(state, snakeGame, null, deathImpact);
        return true;
    }
    const deathImpact = snakeDeathImpactFromContact(spatialFrame, contacts, i, bodyA.id, bodyA, relSpeed);
    instanceA.die(state, snakeGame, null, deathImpact);
    return true;
}
function tryResolveHeadStrikeRam(state, snakeGame, spatialFrame, contacts, i, strikerInstance, strikerBody, victimInstance, victimTraits, victimBody, relSpeed, config, splitLinks) {
    if (!victimTraits.victimOfHeadStrikeRam) return false;
    if (relSpeed < config.splitImpulseThreshold) return false;
    if (strikerBody.id !== strikerInstance.headId) return false;
    if (victimBody.id === victimInstance.headId) return false;
    const victimMembers = orderedMembers(state, victimInstance.headId);
    const struckSegmentId = victimBody.id;
    const strikeIndex = victimMembers.indexOf(struckSegmentId);
    if (strikeIndex < 0 || strikeIndex >= victimMembers.length - 1) return false;
    const linkKey = `${victimMembers[strikeIndex]}:${victimMembers[strikeIndex + 1]}`;
    if (splitLinks.has(linkKey)) return false;
    splitLinks.add(linkKey);
    const deathImpact = snakeDeathImpactFromContact(spatialFrame, contacts, i, struckSegmentId, victimBody, relSpeed);
    splitSnakeAtStruckSegment(state, snakeGame, victimInstance.headId, struckSegmentId, victimMembers, deathImpact);
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
        const traitsA = getInstanceCombatTraits(instanceA);
        const traitsB = getInstanceCombatTraits(instanceB);
        const relSpeed = Math.hypot(contacts.dynamic.preDvx[i], contacts.dynamic.preDvy[i]);
        if (tryResolveFleeBallHeadRam(state, snakeGame, spatialFrame, contacts, i, instanceA, traitsA, instanceB, traitsB, pair.bodyA, pair.bodyB, relSpeed)) continue;
        const fleeChainPair = fleeChainContactPair(instanceA, traitsA, instanceB, traitsB, pair.bodyA, pair.bodyB);
        if (
            fleeChainPair &&
            tryResolveFleeEscapeRam(
                state,
                snakeGame,
                spatialFrame,
                contacts,
                i,
                fleeChainPair.fleeInstance,
                fleeChainPair.chainInstance,
                getInstanceCombatTraits(fleeChainPair.chainInstance),
                fleeChainPair.fleeBody,
                fleeChainPair.chainBody,
                relSpeed,
                config,
                splitLinks,
            )
        )
            continue;
        if (tryResolveBrainRam(state, snakeGame, spatialFrame, contacts, i, instanceA, traitsA, instanceB, traitsB, pair.bodyA, pair.bodyB, relSpeed, config, "squidVsSquid")) continue;
        if (isChainCombatTopology(traitsA) && isChainCombatTopology(traitsB) && pair.bodyA.id === instanceA.headId && pair.bodyB.id === instanceB.headId) continue;
        const distSq = headDistSq(state, instanceA.headId, instanceB.headId);
        const relationshipAB = resolveAgentRelationship(snakeGame, instanceA.headId, instanceB.headId, state, distSq);
        const relationshipBA = resolveAgentRelationship(snakeGame, instanceB.headId, instanceA.headId, state, distSq);
        if (relationshipAB === "prey" || relationshipBA === "prey") {
            const predatorInstance = relationshipAB === "prey" ? instanceA : instanceB;
            const preyInstance = relationshipAB === "prey" ? instanceB : instanceA;
            const predatorBody = relationshipAB === "prey" ? pair.bodyA : pair.bodyB;
            const preyBody = relationshipAB === "prey" ? pair.bodyB : pair.bodyA;
            const predatorTraits = relationshipAB === "prey" ? traitsA : traitsB;
            const preyTraits = relationshipAB === "prey" ? traitsB : traitsA;
            const chainVsBallPrey = isChainCombatTopology(predatorTraits) && !isChainCombatTopology(preyTraits);
            const predatorStrikes = chainVsBallPrey || predatorBody.id === predatorInstance.headId;
            const speedOk = chainVsBallPrey || relSpeed >= config.splitImpulseThreshold;
            if (predatorStrikes && speedOk)
                if (!shouldSkipPreyHeadRamKill(predatorTraits, preyTraits, preyBody.id, preyInstance.headId)) {
                    const deathImpact = snakeDeathImpactFromContact(spatialFrame, contacts, i, preyBody.id, preyBody, relSpeed);
                    preyInstance.die(state, snakeGame, null, deathImpact);
                    continue;
                }
        }
        if (!isChainCombatTopology(traitsA) || !isChainCombatTopology(traitsB)) continue;
        if (relationshipAB === "ally") continue;
        tryResolveHeadStrikeRam(state, snakeGame, spatialFrame, contacts, i, instanceA, pair.bodyA, instanceB, traitsB, pair.bodyB, relSpeed, config, splitLinks);
        tryResolveHeadStrikeRam(state, snakeGame, spatialFrame, contacts, i, instanceB, pair.bodyB, instanceA, traitsA, pair.bodyA, relSpeed, config, splitLinks);
    }
}
function restoreHunterContactDrive(hunterHead, hunterPhysId, preyTarget, speedOverride = null) {
    const dx = preyTarget.x - hunterHead.x;
    const dy = preyTarget.y - hunterHead.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 0) return;
    const speed = speedOverride ?? getAgentProfile(AGENT_PROFILE.snake).gameplay?.leader?.maxSpeed ?? Math.hypot(kineticDynamicSlab.vx[hunterPhysId], kineticDynamicSlab.vy[hunterPhysId]);
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
