import { getKineticConstraintGraph } from "./kineticConstraintGraph.js";
import { getKineticConstraintsVersion } from "./kineticConstraints.js";
const MAX_PHYS_BODIES = 4096;
export const islandRootByPhysId = new Int32Array(MAX_PHYS_BODIES);
islandRootByPhysId.fill(-1);
function clearBodyIslandFields(body) {
    delete body._kineticLinkNeighbors;
    delete body._kineticIslandPeers;
    delete body._kineticIslandRoot;
}
export function bakeKineticIslandPlan(state, kineticBodies) {
    const adjacency = getKineticConstraintGraph(state);
    const bodyById = new Map();
    for (let i = 0; i < kineticBodies.length; i++) {
        const body = kineticBodies[i];
        bodyById.set(body.id, body);
        clearBodyIslandFields(body);
        if (body._physId !== undefined) islandRootByPhysId[body._physId] = -1;
    }
    const bodyIdToIslandRoot = new Map();
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
            bodyIdToIslandRoot.set(body.id, root);
            if (body._physId !== undefined) islandRootByPhysId[body._physId] = root;
            if (multiBody) body._kineticIslandPeers = memberBodies;
        }
    }
    state.sandbox._kineticIslandPlan = { version: getKineticConstraintsVersion(state), bodyIdToIslandRoot };
}
export function ensureKineticIslandPlan(state, kineticBodies) {
    const version = getKineticConstraintsVersion(state);
    const plan = state.sandbox._kineticIslandPlan;
    if (plan && plan.version === version) return plan;
    bakeKineticIslandPlan(state, kineticBodies);
    return state.sandbox._kineticIslandPlan;
}
export function shareKineticIsland(bodyA, bodyB) {
    if (bodyA._kineticIslandRoot !== bodyB._kineticIslandRoot) return false;
    return Boolean(bodyA._kineticIslandPeers);
}
export function kineticIslandMembers(body) {
    return body._kineticIslandPeers ?? [body];
}
