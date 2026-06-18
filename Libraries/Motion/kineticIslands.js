export function buildKineticIslands(state, kineticBodies) {
    const constraints = state.sandbox.kineticConstraints;
    if (constraints.length === 0) {
        for (let i = 0; i < kineticBodies.length; i++) {
            const body = kineticBodies[i];
            delete body._kineticIslandPeers;
            body._kineticIslandRoot = body.id;
        }
        return;
    }
    const parent = new Map();
    function find(id) {
        let root = id;
        while (parent.has(root) && parent.get(root) !== root) root = parent.get(root);
        let cursor = id;
        while (parent.has(cursor) && parent.get(cursor) !== root) {
            const next = parent.get(cursor);
            parent.set(cursor, root);
            cursor = next;
        }
        return root;
    }
    function union(a, b) {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent.set(ra, rb);
    }
    for (let i = 0; i < constraints.length; i++) {
        const entry = constraints[i];
        union(entry.bodyAId, entry.bodyBId);
    }
    const membersByRoot = new Map();
    for (let i = 0; i < kineticBodies.length; i++) {
        const body = kineticBodies[i];
        const root = find(body.id);
        body._kineticIslandRoot = root;
        if (!membersByRoot.has(root)) membersByRoot.set(root, []);
        membersByRoot.get(root).push(body);
    }
    for (const members of membersByRoot.values()) {
        if (members.length <= 1) {
            delete members[0]._kineticIslandPeers;
            continue;
        }
        for (let i = 0; i < members.length; i++) members[i]._kineticIslandPeers = members;
    }
}
export function shareKineticIsland(bodyA, bodyB) {
    if (bodyA._kineticIslandRoot !== bodyB._kineticIslandRoot) return false;
    return Boolean(bodyA._kineticIslandPeers);
}
export function kineticIslandMembers(body) {
    return body._kineticIslandPeers ?? [body];
}
