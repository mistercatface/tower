import { kineticConstraintStore } from "../Core/engineMemory.js";
export class KineticSession {
    constructor() {
        kineticConstraintStore.count = 0;
        this.kineticConstraintsDirty = false;
        this.kineticConstraintsVersion = 0;
        this.kineticTopologyGeneration = 0;
        this.nextConstraintId = 1;
    }
}
export function createKineticSession({ constraintsDirty = false, constraintsVersion = 0, topologyGeneration = 0, nextConstraintId = 1 } = {}) {
    const session = new KineticSession();
    session.kineticConstraintsDirty = constraintsDirty;
    session.kineticConstraintsVersion = constraintsVersion;
    session.kineticTopologyGeneration = topologyGeneration;
    session.nextConstraintId = nextConstraintId;
    return session;
}
