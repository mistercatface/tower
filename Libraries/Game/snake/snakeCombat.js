import { resolveRelationshipForInstances } from "./AgentInstance.js";
import { kineticPairBodiesAt } from "../../Spatial/collision/kineticPairStream.js";
import { kineticDynamicSlab } from "../../Spatial/collision/kineticBodySlab.js";
import { KINETIC_PAIR_TIER } from "../../Spatial/collision/kineticNarrowPhase.js";
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
function headDistSq(instanceA, instanceB) {
    const headA = instanceA.head;
    const headB = instanceB.head;
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
function areTeammates(instanceA, instanceB) {
    if (resolveRelationshipForInstances(instanceA, instanceB) === "ally") return true;
    return instanceA.head.faction != null && instanceA.head.faction === instanceB.head.faction;
}
function tryResolveFleeBallHeadRam(state, spatialFrame, contacts, i, instanceA, traitsA, instanceB, traitsB, bodyA, bodyB, relSpeed) {
    if (!traitsA.fleeBallHeadRam || !traitsB.fleeBallHeadRam) return false;
    if (bodyA.id !== instanceA.headId || bodyB.id !== instanceB.headId) return false;
    if (areSameFleeFaction(bodyA, bodyB)) return false;
    const victims = classifyFleeRamVictims(contacts, i);
    if (victims.killA) {
        const impactA = snakeDeathImpactFromContact(spatialFrame, contacts, i, bodyA.id, bodyA, relSpeed);
        instanceA.die(state, impactA);
    }
    if (victims.killB) {
        const impactB = snakeDeathImpactFromContact(spatialFrame, contacts, i, bodyB.id, bodyB, relSpeed);
        instanceB.die(state, impactB);
    }
    return true;
}
function squidDuelSpeedOk(relSpeed, splitImpulseThreshold) {
    return relSpeed >= Math.min(splitImpulseThreshold, 10);
}
function tryResolveBrainRam(state, spatialFrame, contacts, i, instanceA, traitsA, instanceB, traitsB, bodyA, bodyB, relSpeed, resolverId) {
    if (!matchesBrainRamResolver(traitsA, resolverId) || !matchesBrainRamResolver(traitsB, resolverId)) return false;
    if (areTeammates(instanceA, instanceB)) return false;
    const aLeader = bodyA.id === instanceA.headId;
    const bLeader = bodyB.id === instanceB.headId;
    if (!aLeader && !bLeader) {
        if (!squidDuelSpeedOk(relSpeed, instanceA.splitImpulseThreshold)) return false;
        const victims = classifyFleeRamVictims(contacts, i);
        if (victims.killA) {
            const impactA = snakeDeathImpactFromContact(spatialFrame, contacts, i, bodyA.id, bodyA, relSpeed);
            instanceA.die(state, impactA);
        }
        if (victims.killB) {
            const impactB = snakeDeathImpactFromContact(spatialFrame, contacts, i, bodyB.id, bodyB, relSpeed);
            instanceB.die(state, impactB);
        }
        return victims.killA || victims.killB;
    }
    if (aLeader && bLeader) {
        if (!squidDuelSpeedOk(relSpeed, instanceA.splitImpulseThreshold)) return false;
        const victims = classifyFleeRamVictims(contacts, i);
        if (victims.killA) {
            const impactA = snakeDeathImpactFromContact(spatialFrame, contacts, i, bodyA.id, bodyA, relSpeed);
            instanceA.die(state, impactA);
        }
        if (victims.killB) {
            const impactB = snakeDeathImpactFromContact(spatialFrame, contacts, i, bodyB.id, bodyB, relSpeed);
            instanceB.die(state, impactB);
        }
        return victims.killA || victims.killB;
    }
    const deathImpact = snakeDeathImpactFromContact(spatialFrame, contacts, i, bLeader ? bodyB.id : bodyA.id, bLeader ? bodyB : bodyA, relSpeed);
    if (bLeader) instanceB.die(state, deathImpact);
    else instanceA.die(state, deathImpact);
    return true;
}
export function resolveSnakeCombatFromContacts(state, spatialFrame, contacts) {
    if (contacts.count === 0) return;
    const snakeGame = state.sandbox.snakeGame;
    const instancesByMemberId = snakeGame.instancesByMemberId;
    for (let i = 0; i < contacts.count; i++) {
        const pair = kineticPairBodiesAt(spatialFrame, contacts.physIdA[i], contacts.physIdB[i]);
        if (!pair) continue;
        const instanceA = instancesByMemberId.get(pair.bodyA.id);
        const instanceB = instancesByMemberId.get(pair.bodyB.id);
        if (!instanceA || !instanceB || instanceA.lifecycle !== "alive" || instanceB.lifecycle !== "alive" || instanceA === instanceB) continue;
        const traitsA = instanceA.combatTraits;
        const traitsB = instanceB.combatTraits;
        const relSpeed = Math.hypot(contacts.dynamic.preDvx[i], contacts.dynamic.preDvy[i]);
        if (tryResolveFleeBallHeadRam(state, spatialFrame, contacts, i, instanceA, traitsA, instanceB, traitsB, pair.bodyA, pair.bodyB, relSpeed)) continue;
        const fleeChainPair = fleeChainContactPair(instanceA, traitsA, instanceB, traitsB, pair.bodyA, pair.bodyB);
        if (
            fleeChainPair &&
            fleeChainPair.chainInstance.receiveBodyStrike(
                state,
                fleeChainPair.chainBody.id,
                fleeChainPair.fleeInstance,
                fleeChainPair.fleeBody.id,
                relSpeed,
                snakeDeathImpactFromContact(spatialFrame, contacts, i, fleeChainPair.chainBody.id, fleeChainPair.chainBody, relSpeed),
            )
        )
            continue;
        if (tryResolveBrainRam(state, spatialFrame, contacts, i, instanceA, traitsA, instanceB, traitsB, pair.bodyA, pair.bodyB, relSpeed, "squidVsSquid")) continue;
        const bothSquidDuel = matchesBrainRamResolver(traitsA, "squidVsSquid") && matchesBrainRamResolver(traitsB, "squidVsSquid");
        if (!bothSquidDuel && isChainCombatTopology(traitsA) && isChainCombatTopology(traitsB) && pair.bodyA.id === instanceA.headId && pair.bodyB.id === instanceB.headId) continue;
        const distSq = headDistSq(instanceA, instanceB);
        const relationshipAB = resolveRelationshipForInstances(instanceA, instanceB, distSq);
        const relationshipBA = resolveRelationshipForInstances(instanceB, instanceA, distSq);
        if (relationshipAB === "prey" || relationshipBA === "prey") {
            const predatorInstance = relationshipAB === "prey" ? instanceA : instanceB;
            const preyInstance = relationshipAB === "prey" ? instanceB : instanceA;
            const predatorBody = relationshipAB === "prey" ? pair.bodyA : pair.bodyB;
            const preyBody = relationshipAB === "prey" ? pair.bodyB : pair.bodyA;
            const deathImpact = snakeDeathImpactFromContact(spatialFrame, contacts, i, preyBody.id, preyBody, relSpeed);
            if (preyInstance.receivePreyStrike(state, preyBody.id, predatorInstance, predatorBody.id, relSpeed, deathImpact)) continue;
        }
        if (!isChainCombatTopology(traitsA) || !isChainCombatTopology(traitsB)) continue;
        if (relationshipAB === "ally") continue;
        const deathImpactB = snakeDeathImpactFromContact(spatialFrame, contacts, i, pair.bodyB.id, pair.bodyB, relSpeed);
        instanceB.receiveBodyStrike(state, pair.bodyB.id, instanceA, pair.bodyA.id, relSpeed, deathImpactB);
        const deathImpactA = snakeDeathImpactFromContact(spatialFrame, contacts, i, pair.bodyA.id, pair.bodyA, relSpeed);
        instanceA.receiveBodyStrike(state, pair.bodyA.id, instanceB, pair.bodyB.id, relSpeed, deathImpactA);
    }
}
function restoreHunterContactDrive(hunterInstance, hunterPhysId, preyTarget) {
    const hunterHead = hunterInstance.head;
    const dx = preyTarget.x - hunterHead.x;
    const dy = preyTarget.y - hunterHead.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 0) return;
    const speed = hunterHead.strategy.groundNav.maxSpeed;
    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;
    kineticDynamicSlab.vx[hunterPhysId] = vx;
    kineticDynamicSlab.vy[hunterPhysId] = vy;
    hunterHead.vx = vx;
    hunterHead.vy = vy;
}
function applySnakeHuntContactDriveForPair(hunterInstance, hunterBody, hunterPhysId, preyInstance) {
    if (hunterBody.id !== hunterInstance.headId) return;
    const intent = hunterInstance.intent;
    if (intent.getMode() !== "seek_prey") return;
    if (intent.getTargetId() !== preyInstance.headId) return;
    restoreHunterContactDrive(hunterInstance, hunterPhysId, preyInstance.head);
}
export function applySnakeHuntContactDrive(state, spatialFrame, contacts) {
    if (contacts.count === 0) return;
    const snakeGame = state.sandbox.snakeGame;
    const instancesByMemberId = snakeGame.instancesByMemberId;
    for (let i = 0; i < contacts.count; i++) {
        const pair = kineticPairBodiesAt(spatialFrame, contacts.physIdA[i], contacts.physIdB[i]);
        if (!pair) continue;
        const instanceA = instancesByMemberId.get(pair.bodyA.id);
        const instanceB = instancesByMemberId.get(pair.bodyB.id);
        if (!instanceA || !instanceB || instanceA.lifecycle !== "alive" || instanceB.lifecycle !== "alive" || instanceA === instanceB) continue;
        applySnakeHuntContactDriveForPair(instanceA, pair.bodyA, contacts.physIdA[i], instanceB);
        applySnakeHuntContactDriveForPair(instanceB, pair.bodyB, contacts.physIdB[i], instanceA);
    }
}
// ==========================================
// Consolidated agentCombatTraits helpers
// ==========================================
export const COMBAT_TRAIT_DEFAULTS = Object.freeze({
    topology: "ball",
    canSplit: false,
    fleeBallHeadRam: false,
    fleeEscapeRam: false,
    victimOfFleeEscapeRam: false,
    victimOfHeadStrikeRam: false,
    brainRamResolver: null,
    preyHeadRamImmuneLeader: false,
    preyHeadRamImmuneNonLeader: false,
});
export function isChainCombatTopology(traits) {
    return traits.topology === "chain";
}
export function isBallCombatTopology(traits) {
    return traits.topology === "ball";
}
export function matchesBrainRamResolver(traits, resolverId) {
    return traits.brainRamResolver === resolverId;
}
export function shouldSkipPreyHeadRamKill(predatorTraits, preyTraits, preyBodyId, preyLeaderId) {
    const bothUseResolver = predatorTraits.brainRamResolver != null && predatorTraits.brainRamResolver === preyTraits.brainRamResolver;
    const leaderHit = preyBodyId === preyLeaderId;
    if (bothUseResolver) return true;
    if (isChainCombatTopology(preyTraits) && leaderHit && preyTraits.preyHeadRamImmuneLeader) return true;
    if (preyTraits.preyHeadRamImmuneNonLeader && !leaderHit) return true;
    return false;
}
