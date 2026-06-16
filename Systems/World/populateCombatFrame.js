import { wallContextFromState } from "../../Libraries/Spatial/query/wallContext.js";
/**
 * Insert world props into a spatial frame for the current tick.
 * Mutates `pushables` (reused each frame).
 *
 * @param {import("../../Libraries/Spatial/world/SpatialFrameCore.js").SpatialFrameCore} frame
 * @param {object} state
 * @param {object[]} pushables
 */
export function populateCombatFrame(frame, state, pushables) {
    frame.resetFrame(state.obstacleGrid);
    frame.setWallContext(wallContextFromState(state));
    pushables.length = 0;
    let physIdCounter = 0;
    state.entityRegistry.forEachOfKind("worldProp", (prop) => {
        if (!prop || prop.isDead || prop.isHeld) return;
        if (prop.strategy?.spatialRole === "trigger") return;
        frame.insertEntity(prop, physIdCounter++);
        if (prop.strategy?.isPushable) pushables.push(prop);
    });
}
