import { getKineticConstraintGraph } from "./kineticConstraintGraph.js";
import { getKineticConstraintsVersion } from "./kineticConstraints.js";
import { kineticDynamicSlab } from "../Spatial/collision/kineticBodySlab.js";
import { MAX_ENTITIES as MAX_PHYS_BODIES } from "../../Core/engineLimits.js";
export const islandRootByPhysId = new Int32Array(MAX_PHYS_BODIES);
islandRootByPhysId.fill(-1);
function clearBodyIslandFields(body) {
    delete body._kineticLinkNeighbors;
    delete body._kineticIslandPeers;
    delete body._kineticIslandRoot;
}
export function bakeKineticIslandPlan(session, kineticBodies) {
    const adjacent = getKineticConstraintGraph(session);
    const bodyById = new Map();
    for (let i = 0; i < kineticBodies.length; i++) {
        const body = kineticBodies[i];
        bodyById.set(body.id, body);
        clearBodyIslandFields(body);
        if (body._physId !== undefined) {
            islandRootByPhysId[body._physId] = -1;
            kineticDynamicSlab.islandRoot[body._physId] = -1;
        }
    }
    const bodyIdToIslandRoot = new Map();
    for (let i = 0; i < kineticBodies.length; i++) {
        const body = kineticBodies[i];
        const neighborIds = adjacent.get(body.id);
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
            const neighborIds = adjacent.get(id);
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
            if (body._physId !== undefined) {
                islandRootByPhysId[body._physId] = root;
                kineticDynamicSlab.islandRoot[body._physId] = root;
            }
            if (multiBody) body._kineticIslandPeers = memberBodies;
        }
    }
    session._kineticIslandPlan = { version: getKineticConstraintsVersion(session), bodyIdToIslandRoot };
}
export function ensureKineticIslandPlan(session, kineticBodies) {
    const version = getKineticConstraintsVersion(session);
    const plan = session._kineticIslandPlan;
    if (plan && plan.version === version) return plan;
    bakeKineticIslandPlan(session, kineticBodies);
    return session._kineticIslandPlan;
}
export function shareKineticIsland(bodyA, bodyB) {
    if (bodyA._kineticIslandRoot !== bodyB._kineticIslandRoot) return false;
    return Boolean(bodyA._kineticIslandPeers);
}
export function kineticIslandMembers(body) {
    return body._kineticIslandPeers ?? [body];
}
