import { createKineticSession } from "../../GameState/KineticSession.js";
import { createKineticTick } from "../../GameState/KineticTick.js";
import { worldSimFromState } from "../../GameState/WorldSim.js";
import { KineticSpatialFrame } from "../../Systems/World/KineticSpatialFrame.js";
import { snapshotKineticBodySlab } from "../../Libraries/Spatial/collision/entityBroadphase.js";

export function createKineticTestRegistry(liveProps) {
    return {
        membershipGen: 0,
        getLive(id) {
            for (let i = 0; i < liveProps.length; i++) if (liveProps[i].id === id) return liveProps[i];
            return null;
        },
        register(_kind, prop) {
            if (!liveProps.includes(prop)) liveProps.push(prop);
        },
        unregister(prop) {
            const index = liveProps.indexOf(prop);
            if (index >= 0) liveProps.splice(index, 1);
        },
    };
}

export function createKineticTestWorld(initialProps, { constraints = [], constraintsDirty = false } = {}) {
    const worldProps = initialProps.slice();
    const liveProps = initialProps.slice();
    return {
        worldProps,
        entityRegistry: createKineticTestRegistry(liveProps),
        kinetic: createKineticSession({ constraints, constraintsDirty }),
    };
}

export function setupKineticTestFrame(bodies, cellSize = 50) {
    const frame = new KineticSpatialFrame(cellSize);
    frame.resetFrame({ minX: -500, maxX: 500, minY: -500, maxY: 500 });
    for (let i = 0; i < bodies.length; i++) {
        frame.insertEntity(bodies[i], i);
        bodies[i]._physId = i;
    }
    frame._kineticBodies = bodies.slice();
    frame._nextPhysId = bodies.length;
    snapshotKineticBodySlab(frame._kineticBodies);
    frame.syncActiveKineticBodies();
    return frame;
}

export function createKineticTestTick(initialProps, options = {}) {
    const world = createKineticTestWorld(initialProps, options);
    const frame = setupKineticTestFrame(initialProps, options.cellSize);
    return createKineticTick(frame, world);
}

export function attachKineticTestTickFromState(state, props, cellSize = state.obstacleGrid?.cellSize ?? 16) {
    const frame = new KineticSpatialFrame(cellSize);
    frame.resetFrame(state.obstacleGrid);
    for (let i = 0; i < props.length; i++) {
        frame.insertEntity(props[i], i);
        props[i]._physId = i;
    }
    frame._kineticBodies = props.slice();
    frame._nextPhysId = props.length;
    snapshotKineticBodySlab(frame._kineticBodies);
    frame.syncActiveKineticBodies();
    return createKineticTick(frame, worldSimFromState(state));
}
