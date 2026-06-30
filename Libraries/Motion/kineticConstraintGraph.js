import { listKineticConstraints, getKineticConstraintsVersion } from "./kineticConstraints.js";
function addAdjacencyEdge(adjacency, fromId, toId) {
    let neighbors = adjacency.get(fromId);
    if (!neighbors) {
        neighbors = [];
        adjacency.set(fromId, neighbors);
    }
    neighbors.push(toId);
}
function buildAdjacency(session) {
    const list = listKineticConstraints(session);
    const adjacency = new Map();
    for (let i = 0; i < list.length; i++) {
        const entry = list[i];
        addAdjacencyEdge(adjacency, entry.bodyAId, entry.bodyBId);
        addAdjacencyEdge(adjacency, entry.bodyBId, entry.bodyAId);
    }
    return adjacency;
}
function getGraphCache(session) {
    const version = getKineticConstraintsVersion(session);
    let cache = session._kineticConstraintGraphCache;
    if (!cache || cache.version !== version) {
        cache = { version, adjacency: buildAdjacency(session), paths: new Map(), connectedIds: new Map(), islands: null };
        session._kineticConstraintGraphCache = cache;
    }
    return cache;
}
export function getKineticConstraintGraph(session) {
    return getGraphCache(session).adjacency;
}
export function getConnectedBodyIds(session, bodyId) {
    const cache = getGraphCache(session);
    if (cache.connectedIds.has(bodyId)) return cache.connectedIds.get(bodyId);
    const adjacency = cache.adjacency;
    const members = new Set([bodyId]);
    const stack = [bodyId];
    while (stack.length > 0) {
        const current = stack.pop();
        const neighbors = adjacency.get(current);
        if (!neighbors) continue;
        for (let i = 0; i < neighbors.length; i++) {
            const next = neighbors[i];
            if (!members.has(next)) {
                members.add(next);
                stack.push(next);
            }
        }
    }
    const result = [...members];
    for (let i = 0; i < result.length; i++) cache.connectedIds.set(result[i], result);
    return result;
}
export function getConnectedComponentPath(session, endpointId) {
    const cache = getGraphCache(session);
    if (cache.paths.has(endpointId)) return cache.paths.get(endpointId);
    const adjacency = cache.adjacency;
    const ordered = [endpointId];
    const visited = new Set([endpointId]);
    let current = endpointId;
    while (true) {
        const neighbors = adjacency.get(current);
        let next = null;
        if (neighbors)
            for (let i = 0; i < neighbors.length; i++)
                if (!visited.has(neighbors[i])) {
                    next = neighbors[i];
                    break;
                }
        if (next == null) break;
        ordered.push(next);
        visited.add(next);
        current = next;
    }
    cache.paths.set(endpointId, ordered);
    return ordered;
}
/** Full left-to-right order for a simple chain; works when `bodyId` is a middle link. */
export function getLinearChainOrderedMembers(session, bodyId) {
    const adjacency = getGraphCache(session).adjacency;
    const degree = adjacency.get(bodyId)?.length ?? 0;
    if (degree <= 1) return getConnectedComponentPath(session, bodyId);
    const members = getConnectedBodyIds(session, bodyId);
    for (let i = 0; i < members.length; i++) {
        const id = members[i];
        if ((adjacency.get(id)?.length ?? 0) === 1) return getConnectedComponentPath(session, id);
    }
    return getConnectedComponentPath(session, bodyId);
}
export function areBodiesConnected(session, bodyAId, bodyBId) {
    if (bodyAId === bodyBId) return true;
    return getConnectedBodyIds(session, bodyAId).includes(bodyBId);
}
export function getConstraintIslands(session) {
    const cache = getGraphCache(session);
    if (cache.islands) return cache.islands;
    const adjacency = cache.adjacency;
    const seen = new Set();
    const islands = [];
    for (const startId of adjacency.keys()) {
        if (seen.has(startId)) continue;
        const island = [];
        const stack = [startId];
        seen.add(startId);
        while (stack.length > 0) {
            const current = stack.pop();
            island.push(current);
            const neighbors = adjacency.get(current);
            if (!neighbors) continue;
            for (let i = 0; i < neighbors.length; i++) {
                const next = neighbors[i];
                if (!seen.has(next)) {
                    seen.add(next);
                    stack.push(next);
                }
            }
        }
        islands.push(island);
    }
    cache.islands = islands;
    return islands;
}
