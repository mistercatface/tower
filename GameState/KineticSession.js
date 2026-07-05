export class KineticSession {
    constructor() {
        this.kineticConstraints = [];
        this.kineticConstraintsDirty = false;
        this.kineticConstraintsVersion = 0;
        this.kineticTopologyGeneration = 0;
        this.nextConstraintId = 1;
        this.deferredFractures = [];
        this.deferredFracturesCount = 0;
    }
}
export function createKineticSession({ constraints = [], constraintsDirty = false, constraintsVersion = 0, topologyGeneration = 0, nextConstraintId = 1 } = {}) {
    const session = new KineticSession();
    session.kineticConstraints = constraints.slice();
    session.kineticConstraintsDirty = constraintsDirty;
    session.kineticConstraintsVersion = constraintsVersion;
    session.kineticTopologyGeneration = topologyGeneration;
    session.nextConstraintId = nextConstraintId;
    return session;
}
