export function createFleeAgentRegistry() {
    return { aliveByHeadId: new Map(), instancesByHeadId: new Map() };
}
