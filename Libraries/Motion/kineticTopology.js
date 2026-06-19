export function getKineticTopologyGeneration(state) {
    return state.sandbox.kineticTopologyGeneration ?? 0;
}
export function bumpKineticTopologyGeneration(state) {
    state.sandbox.kineticTopologyGeneration = getKineticTopologyGeneration(state) + 1;
}
export function stampKineticPairGatherTopology(spatialFrame, state) {
    spatialFrame._kineticPairGatherTopologyGen = getKineticTopologyGeneration(state);
}
export function kineticPairTopologyStale(spatialFrame, state) {
    const gatherGen = spatialFrame._kineticPairGatherTopologyGen;
    if (gatherGen === undefined) return false;
    return gatherGen !== getKineticTopologyGeneration(state);
}
