import { bumpKineticTopologyGeneration } from "./kineticTopology.js";
let nextKineticConstraintId = 1;
export function markKineticConstraintsDirty(session) {
    session.kineticConstraintsDirty = true;
    session.kineticConstraintsVersion = (session.kineticConstraintsVersion ?? 0) + 1;
    bumpKineticTopologyGeneration(session);
}
export function getKineticConstraintsVersion(session) {
    return session.kineticConstraintsVersion ?? 0;
}
export function resetKineticConstraintIds(startId = 1) {
    nextKineticConstraintId = startId;
}
export function addDistanceConstraint(session, { bodyA, bodyB, anchorA = { x: 0, y: 0 }, anchorB = { x: 0, y: 0 }, restLength }) {
    const constraint = {
        id: nextKineticConstraintId++,
        type: "distance",
        bodyAId: bodyA.id,
        bodyBId: bodyB.id,
        bodyA,
        bodyB,
        anchorA: { x: anchorA.x, y: anchorA.y },
        anchorB: { x: anchorB.x, y: anchorB.y },
        restLength,
    };
    session.kineticConstraints.push(constraint);
    markKineticConstraintsDirty(session);
    return constraint;
}
export function removeKineticConstraint(session, constraintId) {
    const list = session.kineticConstraints;
    const index = list.findIndex((entry) => entry.id === constraintId);
    if (index >= 0) {
        list.splice(index, 1);
        markKineticConstraintsDirty(session);
    }
}
export function clearKineticConstraints(session) {
    if (session.kineticConstraints.length === 0) return;
    session.kineticConstraints.length = 0;
    markKineticConstraintsDirty(session);
}
export function pruneKineticConstraintsForBody(session, bodyId) {
    const list = session.kineticConstraints;
    let changed = false;
    for (let i = list.length - 1; i >= 0; i--) {
        const entry = list[i];
        if (entry.bodyAId === bodyId || entry.bodyBId === bodyId) {
            list.splice(i, 1);
            changed = true;
        }
    }
    if (changed) markKineticConstraintsDirty(session);
}
export function listKineticConstraints(session) {
    return session.kineticConstraints;
}
export function collectKineticConstraintsSnapshot(session, propIdToIndex) {
    const entries = [];
    const list = listKineticConstraints(session);
    for (let i = 0; i < list.length; i++) {
        const constraint = list[i];
        const bodyA = propIdToIndex.get(constraint.bodyAId);
        const bodyB = propIdToIndex.get(constraint.bodyBId);
        if (bodyA == null || bodyB == null) continue;
        entries.push({ bodyA, bodyB, restLength: constraint.restLength, anchorA: { x: constraint.anchorA.x, y: constraint.anchorA.y }, anchorB: { x: constraint.anchorB.x, y: constraint.anchorB.y } });
    }
    return entries;
}
export function applyKineticConstraintsFromSnapshot(session, entries, propRefsByIndex) {
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        addDistanceConstraint(session, { bodyA: propRefsByIndex[entry.bodyA], bodyB: propRefsByIndex[entry.bodyB], restLength: entry.restLength, anchorA: entry.anchorA, anchorB: entry.anchorB });
    }
}
