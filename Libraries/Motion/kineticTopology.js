export function getKineticTopologyGeneration(sandbox) {
    return sandbox.kineticTopologyGeneration ?? 0;
}
export function bumpKineticTopologyGeneration(sandbox) {
    sandbox.kineticTopologyGeneration = getKineticTopologyGeneration(sandbox) + 1;
}
export function stampKineticPairGatherTopology(spatialFrame, sandbox) {
    spatialFrame._kineticPairGatherTopologyGen = getKineticTopologyGeneration(sandbox);
    spatialFrame._kineticTopologySandbox = sandbox;
}
export function kineticPairTopologyStale(spatialFrame) {
    const gatherGen = spatialFrame._kineticPairGatherTopologyGen;
    if (gatherGen === undefined) return false;
    const sandbox = spatialFrame._kineticTopologySandbox;
    if (!sandbox) return false;
    return gatherGen !== getKineticTopologyGeneration(sandbox);
}
