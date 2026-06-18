import { distanceBetweenAnchors } from "../Motion/constraintAnchors.js";
import { addDistanceConstraint, listKineticConstraints, removeKineticConstraint } from "../Motion/kineticConstraints.js";
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
    const members = new Set([propId]);
    let changed = true;
    const list = listKineticConstraints(state);
    while (changed) {
        changed = false;
        for (let i = 0; i < list.length; i++) {
            const entry = list[i];
            if (entry.type !== "distance") continue;
            const hasA = members.has(entry.bodyAId);
            const hasB = members.has(entry.bodyBId);
            if (hasA && !hasB) {
                members.add(entry.bodyBId);
                changed = true;
            } else if (hasB && !hasA) {
                members.add(entry.bodyAId);
                changed = true;
            }
        }
    }
    return [...members];
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
export function addChainLink(state, fromPropId, toPropId) {
    if (fromPropId === toPropId) return false;
    const bodyA = state.entityRegistry.getLive(fromPropId);
    const bodyB = state.entityRegistry.getLive(toPropId);
    if (!isChainLinkBall(bodyA) || !isChainLinkBall(bodyB)) return false;
    if (hasChainLinkBetween(state, fromPropId, toPropId)) return true;
    const restLength = distanceBetweenAnchors(bodyA, { x: 0, y: 0 }, bodyB, { x: 0, y: 0 });
    addDistanceConstraint(state, { bodyAId: fromPropId, bodyBId: toPropId, restLength });
    return true;
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
export function appendChainLinkWireOverlayCommands(out, state, { wireFromPropId = null, wireCursor = null } = {}) {
    if (wireFromPropId != null && wireCursor) {
        const from = state.entityRegistry.getLive(wireFromPropId);
        if (from) appendOverlayWireLink(out, from.x, from.y, wireCursor.x, wireCursor.y, "#81D4FA", { live: true, lineWidth: 2, dash: [5, 4] });
    }
}
