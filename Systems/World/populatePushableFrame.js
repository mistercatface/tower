import { wallContextFromState } from "../../Libraries/Spatial/query/wallContext.js";
/**
 * @param {import("../../Libraries/Spatial/world/SpatialFrameCore.js").SpatialFrameCore} frame
 * @param {object} state
 * @param {object[]} pushables
 * @param {number} [physIdCounter]
 * @returns {number}
 */
export function insertPushables(frame, state, pushables, physIdCounter = 0) {
    pushables.length = 0;
    for (const pickup of state.pickups) {
        if (pickup.isDead) continue;
        if (pickup.elevation != null && pickup.elevation < -6) continue;
        frame.insertEntity(pickup, physIdCounter++);
        if (pickup.strategy?.isPushable) pushables.push(pickup);
    }
    return physIdCounter;
}
/** @param {import("../../Libraries/Spatial/world/SpatialFrameCore.js").SpatialFrameCore} frame @param {object} state @param {object[]} pushables */
export function populatePushableFrame(frame, state, pushables) {
    frame.resetFrame(state.obstacleGrid);
    frame.setWallContext(wallContextFromState(state));
    insertPushables(frame, state, pushables);
}
