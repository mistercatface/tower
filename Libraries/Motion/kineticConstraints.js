let nextKineticConstraintId = 1;
export function resetKineticConstraintIds(startId = 1) {
    nextKineticConstraintId = startId;
}
export function addDistanceConstraint(state, { bodyAId, bodyBId, anchorA = { x: 0, y: 0 }, anchorB = { x: 0, y: 0 }, restLength }) {
    const constraint = { id: nextKineticConstraintId++, type: "distance", bodyAId, bodyBId, anchorA: { x: anchorA.x, y: anchorA.y }, anchorB: { x: anchorB.x, y: anchorB.y }, restLength };
    state.sandbox.kineticConstraints.push(constraint);
    return constraint;
}
export function removeKineticConstraint(state, constraintId) {
    const list = state.sandbox.kineticConstraints;
    const index = list.findIndex((entry) => entry.id === constraintId);
    if (index >= 0) list.splice(index, 1);
}
export function clearKineticConstraints(state) {
    state.sandbox.kineticConstraints.length = 0;
}
export function pruneKineticConstraintsForBody(state, bodyId) {
    const list = state.sandbox.kineticConstraints;
    for (let i = list.length - 1; i >= 0; i--) {
        const entry = list[i];
        if (entry.bodyAId === bodyId || entry.bodyBId === bodyId) list.splice(i, 1);
    }
}
export function listKineticConstraints(state) {
    return state.sandbox.kineticConstraints;
}
