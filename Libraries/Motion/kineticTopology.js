export function getKineticTopologyGeneration(session) {
    return session.kineticTopologyGeneration ?? 0;
}
export function bumpKineticTopologyGeneration(session) {
    session.kineticTopologyGeneration = getKineticTopologyGeneration(session) + 1;
}
export function stampKineticPairGatherTopology(spatialFrame, session) {
    spatialFrame._kineticPairGatherTopologyGen = getKineticTopologyGeneration(session);
    spatialFrame._kineticTopologySession = session;
}
export function kineticPairTopologyStale(spatialFrame) {
    const gatherGen = spatialFrame._kineticPairGatherTopologyGen;
    if (gatherGen === undefined) return false;
    const session = spatialFrame._kineticTopologySession;
    if (!session) return false;
    return gatherGen !== getKineticTopologyGeneration(session);
}
