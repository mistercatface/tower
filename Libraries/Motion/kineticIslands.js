import { getConstraintIslands, getKineticConstraintGraph } from "./kineticConstraintGraph.js";
import { getKineticConstraintsVersion } from "./kineticConstraints.js";
import { kineticDynamicSlab } from "../Spatial/collision/kineticBodySlab.js";
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
        body._kineticIslandRoot = body.id;
        if (body._physId !== undefined) kineticDynamicSlab.islandRoot[body._physId] = body.id;
    }
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
    const islands = getConstraintIslands(session);
    for (let i = 0; i < islands.length; i++) {
        const ids = islands[i];
        const memberBodies = [];
        for (let j = 0; j < ids.length; j++) {
            const id = ids[j];
            const body = bodyById.get(id);
            if (body) memberBodies.push(body);
        }
        if (memberBodies.length === 0) continue;
        const root = memberBodies[0].id;
        const multiBody = memberBodies.length > 1;
        for (let m = 0; m < memberBodies.length; m++) {
            const body = memberBodies[m];
            body._kineticIslandRoot = root;
            if (body._physId !== undefined) kineticDynamicSlab.islandRoot[body._physId] = root;
            if (multiBody) body._kineticIslandPeers = memberBodies;
        }
    }
    session._kineticIslandPlan = { version: getKineticConstraintsVersion(session) };
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
