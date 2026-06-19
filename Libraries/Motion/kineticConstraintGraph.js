import { listKineticConstraints, getKineticConstraintsVersion } from "./kineticConstraints.js";
function addAdjacencyEdge(adjacency, fromId, toId) {
    let neighbors = adjacency.get(fromId);
    if (!neighbors) {
        neighbors = [];
        adjacency.set(fromId, neighbors);
    }
    neighbors.push(toId);
}
function buildAdjacency(state) {
    const list = listKineticConstraints(state);
    const adjacency = new Map();
    for (let i = 0; i < list.length; i++) {
        const entry = list[i];
        addAdjacencyEdge(adjacency, entry.bodyAId, entry.bodyBId);
        addAdjacencyEdge(adjacency, entry.bodyBId, entry.bodyAId);
    }
    return adjacency;
}
/**
 * Undirected adjacency map of bodies connected by kinetic constraints.
 * Built once per constraint-topology change and cached on the sandbox, so the
 * many per-frame connectivity queries share a single O(E) build.
 * @returns {Map<number, number[]>}
 */
export function getKineticConstraintGraph(state) {
    const sandbox = state.sandbox;
    const version = getKineticConstraintsVersion(state);
    const cache = sandbox._kineticConstraintGraphCache;
    if (cache && cache.version === version) return cache.adjacency;
    const adjacency = buildAdjacency(state);
    sandbox._kineticConstraintGraphCache = { version, adjacency };
    return adjacency;
}
/**
 * Body ids in the same constraint island as `bodyId` (the connected component),
 * including `bodyId` itself. O(island size) over the cached graph.
 * @returns {number[]}
 */
export function getConnectedBodyIds(state, bodyId) {
    const adjacency = getKineticConstraintGraph(state);
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
/**
 * Ordered traversal of a path-shaped island starting from `endpointId`,
 * following unvisited neighbors one hop at a time. For acyclic chains this is
 * the endpoint-to-endpoint ordering; for branching/cyclic islands it returns
 * one valid walk. O(island size) over the cached graph.
 * @returns {number[]}
 */
export function getConnectedComponentPath(state, endpointId) {
    const adjacency = getKineticConstraintGraph(state);
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
/** Whether two bodies belong to the same constraint island. */
export function areBodiesConnected(state, bodyAId, bodyBId) {
    if (bodyAId === bodyBId) return true;
    const adjacency = getKineticConstraintGraph(state);
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
/**
 * All constraint islands as arrays of body ids. Bodies with no constraints are
 * omitted (they form trivial singleton islands). O(V + E) over the cached graph.
 * @returns {number[][]}
 */
export function getConstraintIslands(state) {
    const adjacency = getKineticConstraintGraph(state);
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
