import { wallContextFromState } from "../../Libraries/Spatial/query/wallContext.js";
/**
 * Insert world props into a spatial frame for the current tick.
 * Mutates `kineticBodies` with every sim kinetic body (sleeping + awake).
 */
export function populateKineticFrame(frame, state, kineticBodies) {
    frame.resetFrame(state.obstacleGrid);
    frame.setWallContext(wallContextFromState(state));
    kineticBodies.length = 0;
    let physIdCounter = 0;
    state.entityRegistry.forEachOfKind("worldProp", (prop) => {
        if (!prop) return;
        if (prop.strategy?.spatialRole === "trigger") return;
        frame.insertEntity(prop, physIdCounter++);
        if (prop.strategy?.isKinetic) kineticBodies.push(prop);
    });
}
