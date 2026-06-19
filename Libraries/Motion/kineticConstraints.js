import { bumpKineticTopologyGeneration } from "./kineticTopology.js";
let nextKineticConstraintId = 1;
export function markKineticConstraintsDirty(sandbox) {
    sandbox.kineticConstraintsDirty = true;
    sandbox.kineticConstraintsVersion = (sandbox.kineticConstraintsVersion ?? 0) + 1;
    bumpKineticTopologyGeneration(sandbox);
}
export function getKineticConstraintsVersion(sandbox) {
    return sandbox.kineticConstraintsVersion ?? 0;
}
export function resetKineticConstraintIds(startId = 1) {
    nextKineticConstraintId = startId;
}
export function addDistanceConstraint(sandbox, { bodyAId, bodyBId, anchorA = { x: 0, y: 0 }, anchorB = { x: 0, y: 0 }, restLength }) {
    const constraint = { id: nextKineticConstraintId++, type: "distance", bodyAId, bodyBId, anchorA: { x: anchorA.x, y: anchorA.y }, anchorB: { x: anchorB.x, y: anchorB.y }, restLength };
    sandbox.kineticConstraints.push(constraint);
    markKineticConstraintsDirty(sandbox);
    return constraint;
}
export function removeKineticConstraint(sandbox, constraintId) {
    const list = sandbox.kineticConstraints;
    const index = list.findIndex((entry) => entry.id === constraintId);
    if (index >= 0) {
        list.splice(index, 1);
        markKineticConstraintsDirty(sandbox);
    }
}
export function clearKineticConstraints(sandbox) {
    if (sandbox.kineticConstraints.length === 0) return;
    sandbox.kineticConstraints.length = 0;
    markKineticConstraintsDirty(sandbox);
}
export function pruneKineticConstraintsForBody(sandbox, bodyId) {
    const list = sandbox.kineticConstraints;
    let changed = false;
    for (let i = list.length - 1; i >= 0; i--) {
        const entry = list[i];
        if (entry.bodyAId === bodyId || entry.bodyBId === bodyId) {
            list.splice(i, 1);
            changed = true;
        }
    }
    if (changed) markKineticConstraintsDirty(sandbox);
}
export function listKineticConstraints(sandbox) {
    return sandbox.kineticConstraints;
}
export function collectKineticConstraintsSnapshot(sandbox, propIdToIndex) {
    const entries = [];
    const list = listKineticConstraints(sandbox);
    for (let i = 0; i < list.length; i++) {
        const constraint = list[i];
        const bodyA = propIdToIndex.get(constraint.bodyAId);
        const bodyB = propIdToIndex.get(constraint.bodyBId);
        if (bodyA == null || bodyB == null) continue;
        entries.push({ bodyA, bodyB, restLength: constraint.restLength, anchorA: { x: constraint.anchorA.x, y: constraint.anchorA.y }, anchorB: { x: constraint.anchorB.x, y: constraint.anchorB.y } });
    }
    return entries;
}
export function applyKineticConstraintsFromSnapshot(sandbox, entries, propIdsByIndex) {
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        addDistanceConstraint(sandbox, { bodyAId: propIdsByIndex[entry.bodyA], bodyBId: propIdsByIndex[entry.bodyB], restLength: entry.restLength, anchorA: entry.anchorA, anchorB: entry.anchorB });
    }
}
