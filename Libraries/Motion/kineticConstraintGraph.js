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
export function getKineticConstraintGraph(session) {
    const version = getKineticConstraintsVersion(session);
    const cache = session._kineticConstraintGraphCache;
    if (cache && cache.version === version) return cache.adjacency;
    const adjacency = buildAdjacency(session);
    session._kineticConstraintGraphCache = { version, adjacency };
    return adjacency;
}
export function getConnectedBodyIds(session, bodyId) {
    const adjacency = getKineticConstraintGraph(session);
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
    return [...members];
}
export function getConnectedComponentPath(session, endpointId) {
    const adjacency = getKineticConstraintGraph(session);
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
    return ordered;
}
export function areBodiesConnected(session, bodyAId, bodyBId) {
    if (bodyAId === bodyBId) return true;
    const adjacency = getKineticConstraintGraph(session);
    const visited = new Set([bodyAId]);
    const stack = [bodyAId];
    while (stack.length > 0) {
        const current = stack.pop();
        const neighbors = adjacency.get(current);
        if (!neighbors) continue;
        for (let i = 0; i < neighbors.length; i++) {
            const next = neighbors[i];
            if (next === bodyBId) return true;
            if (!visited.has(next)) {
                visited.add(next);
                stack.push(next);
            }
        }
    }
    return false;
}
export function getConstraintIslands(session) {
    const adjacency = getKineticConstraintGraph(session);
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
    return islands;
}
