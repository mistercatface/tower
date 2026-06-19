import { addDistanceConstraint, listKineticConstraints, removeKineticConstraint } from "../Motion/kineticConstraints.js";
import { getConnectedBodyIds, getConnectedComponentPath } from "../Motion/kineticConstraintGraph.js";
import { getSandboxEntityMeta } from "../../GameState/sandboxEntityMeta.js";
import { getPropAsset, formatPropTypeLabel } from "../Props/PropCatalog.js";
import { sandboxAssetMatchesTagFilter } from "./sandboxCapabilities.js";
import { appendOverlayWireLink } from "../Render/overlays/overlayCommands.js";
export function isChainLinkBall(prop) {
    if (!prop?.strategy?.isKinetic) return false;
    return sandboxAssetMatchesTagFilter(getPropAsset(prop.type), "nav");
}
export function hasChainMembership(state, propId) {
    const list = listKineticConstraints(state);
    for (let i = 0; i < list.length; i++) {
        const entry = list[i];
        if (entry.bodyAId === propId || entry.bodyBId === propId) return true;
    }
    return false;
}
export function isChainSteeringTarget(state, entityMeta, propId) {
    if (entityMeta.isChainHead(propId)) return true;
    if (hasChainMembership(state, propId)) return false;
    const prop = state.entityRegistry.getLive(propId);
    if (!prop || prop.isDead) return false;
    return isChainLinkBall(prop);
}
export function getChainMemberIds(state, propId) {
    return getConnectedBodyIds(state, propId);
}
export function setChainHead(state, entityMeta, propId) {
    const members = getChainMemberIds(state, propId);
    for (let i = 0; i < members.length; i++) entityMeta.setChainHead(members[i], false);
    entityMeta.setChainHead(propId, true);
}
export function hasChainLinkBetween(state, bodyAId, bodyBId) {
    const list = listKineticConstraints(state);
    for (let i = 0; i < list.length; i++) {
        const entry = list[i];
        if (entry.type !== "distance") continue;
        if ((entry.bodyAId === bodyAId && entry.bodyBId === bodyBId) || (entry.bodyAId === bodyBId && entry.bodyBId === bodyAId)) return true;
    }
    return false;
}
export function findDistanceConstraintBetween(state, bodyAId, bodyBId) {
    const list = listKineticConstraints(state);
    for (let i = 0; i < list.length; i++) {
        const entry = list[i];
        if (entry.type !== "distance") continue;
        if ((entry.bodyAId === bodyAId && entry.bodyBId === bodyBId) || (entry.bodyAId === bodyBId && entry.bodyBId === bodyAId)) return entry;
    }
    return null;
}
export function getOrderedChainMemberIds(state, headId) {
    return getConnectedComponentPath(state, headId);
}
export function removeChainLinkBetween(state, bodyAId, bodyBId) {
    const entry = findDistanceConstraintBetween(state, bodyAId, bodyBId);
    if (!entry) return false;
    removeKineticConstraint(state, entry.id);
    return true;
}
export function clearChainLinksForMembers(state, memberIds) {
    const members = new Set(memberIds);
    const list = listKineticConstraints(state);
    for (let i = list.length - 1; i >= 0; i--) {
        const entry = list[i];
        if (entry.type !== "distance") continue;
        if (members.has(entry.bodyAId) && members.has(entry.bodyBId)) removeKineticConstraint(state, entry.id);
    }
}
export function addChainLink(state, fromPropId, toPropId, linkSlack = 1) {
    if (fromPropId === toPropId) return false;
    const bodyA = state.entityRegistry.getLive(fromPropId);
    const bodyB = state.entityRegistry.getLive(toPropId);
    if (!isChainLinkBall(bodyA) || !isChainLinkBall(bodyB)) return false;
    if (hasChainLinkBetween(state, fromPropId, toPropId)) return true;
    const restLength = resolveChainLinkRestLength(bodyA, bodyB, linkSlack);
    addDistanceConstraint(state, { bodyAId: fromPropId, bodyBId: toPropId, restLength });
    return true;
}
export function resolveChainLinkRestLength(bodyA, bodyB, linkSlack) {
    return (bodyA.radius + bodyB.radius) * linkSlack;
}
export function resyncChainLinkRestLengths(state, memberIds, linkSlack) {
    const members = new Set(memberIds);
    const list = listKineticConstraints(state);
    for (let i = 0; i < list.length; i++) {
        const entry = list[i];
        if (entry.type !== "distance") continue;
        if (!members.has(entry.bodyAId) || !members.has(entry.bodyBId)) continue;
        const bodyA = state.entityRegistry.getLive(entry.bodyAId);
        const bodyB = state.entityRegistry.getLive(entry.bodyBId);
        entry.restLength = resolveChainLinkRestLength(bodyA, bodyB, linkSlack);
    }
}
export function listChainLinkEndpoints(state, propId) {
    const list = listKineticConstraints(state);
    const endpoints = [];
    for (let i = 0; i < list.length; i++) {
        const entry = list[i];
        if (entry.type !== "distance") continue;
        if (entry.bodyAId !== propId && entry.bodyBId !== propId) continue;
        const targetId = entry.bodyAId === propId ? entry.bodyBId : entry.bodyAId;
        const target = state.entityRegistry.getLive(targetId);
        if (!target) continue;
        endpoints.push({ constraintId: entry.id, targetId, label: `${formatPropTypeLabel(target.type)} · #${target.id}`, x: target.x, y: target.y });
    }
    return endpoints;
}
export function clearChainLinksForProp(state, propId) {
    const list = listKineticConstraints(state);
    for (let i = list.length - 1; i >= 0; i--) {
        const entry = list[i];
        if (entry.bodyAId === propId || entry.bodyBId === propId) removeKineticConstraint(state, entry.id);
    }
}
export function resolveGroundNavSteeringProp(state, entityMeta, propIds) {
    for (let i = 0; i < propIds.length; i++) if (entityMeta.isChainHead(propIds[i])) return state.entityRegistry.getLive(propIds[i]);
    for (let i = 0; i < propIds.length; i++) if (isChainSteeringTarget(state, entityMeta, propIds[i])) return state.entityRegistry.getLive(propIds[i]);
    return null;
}
export function findChainHeadProp(state) {
    const meta = getSandboxEntityMeta(state);
    let head = null;
    state.entityRegistry.forEachOfKind("worldProp", (prop) => {
        if (prop.isDead || !meta.isChainHead(prop.id)) return;
        head = prop;
    });
    return head;
}
export function appendChainLinkWireOverlayCommands(out, state, { wireFromPropId = null, wireCursor = null } = {}) {
    if (wireFromPropId != null && wireCursor) {
        const from = state.entityRegistry.getLive(wireFromPropId);
        if (from) appendOverlayWireLink(out, from.x, from.y, wireCursor.x, wireCursor.y, "#81D4FA", { live: true, lineWidth: 2, dash: [5, 4] });
    }
}
