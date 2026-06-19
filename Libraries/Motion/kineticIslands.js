import { getKineticConstraintGraph } from "./kineticConstraintGraph.js";
/**
 * Annotate the live kinetic bodies with their constraint-island grouping for the
 * solver and sleep systems. Connectivity comes from the shared, version-cached
 * constraint graph (see kineticConstraintGraph.js); this pass only translates
 * that graph into the body-resident layout the hot loops read:
 *   - `_kineticLinkNeighbors`: directly-linked in-frame bodies (one hop)
 *   - `_kineticIslandPeers`: all in-frame bodies in the island (only when > 1)
 *   - `_kineticIslandRoot`: shared id per island; the body's own id when alone
 * Bodies absent from the spatial frame are skipped during translation, so an
 * island's peer/neighbor lists only ever reference bodies present this frame.
 */
export function buildKineticIslands(state, kineticBodies) {
    const adjacency = getKineticConstraintGraph(state);
    const bodyById = new Map();
    for (let i = 0; i < kineticBodies.length; i++) bodyById.set(kineticBodies[i].id, kineticBodies[i]);
    for (let i = 0; i < kineticBodies.length; i++) {
        const body = kineticBodies[i];
        const neighborIds = adjacency.get(body.id);
        let linkNeighbors = null;
        if (neighborIds)
            for (let j = 0; j < neighborIds.length; j++) {
                const neighbor = bodyById.get(neighborIds[j]);
                if (!neighbor) continue;
                if (!linkNeighbors) linkNeighbors = [];
                linkNeighbors.push(neighbor);
            }
        if (linkNeighbors) body._kineticLinkNeighbors = linkNeighbors;
        else delete body._kineticLinkNeighbors;
    }
    const assigned = new Set();
    for (let i = 0; i < kineticBodies.length; i++) {
        const start = kineticBodies[i];
        if (assigned.has(start.id)) continue;
        const memberBodies = [];
        const seen = new Set([start.id]);
        const stack = [start.id];
        while (stack.length > 0) {
            const id = stack.pop();
            const body = bodyById.get(id);
            if (body) memberBodies.push(body);
            const neighborIds = adjacency.get(id);
            if (!neighborIds) continue;
            for (let k = 0; k < neighborIds.length; k++) {
                const neighborId = neighborIds[k];
                if (!seen.has(neighborId)) {
                    seen.add(neighborId);
                    stack.push(neighborId);
                }
            }
        }
        const root = memberBodies[0].id;
        const multiBody = memberBodies.length > 1;
        for (let m = 0; m < memberBodies.length; m++) {
            const body = memberBodies[m];
            assigned.add(body.id);
            body._kineticIslandRoot = root;
            if (multiBody) body._kineticIslandPeers = memberBodies;
            else delete body._kineticIslandPeers;
        }
    }
}
export function shareKineticIsland(bodyA, bodyB) {
    if (bodyA._kineticIslandRoot !== bodyB._kineticIslandRoot) return false;
    return Boolean(bodyA._kineticIslandPeers);
}
export function kineticIslandMembers(body) {
    return body._kineticIslandPeers ?? [body];
}
