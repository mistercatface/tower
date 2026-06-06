import { wallContextFromState } from "../../Libraries/Spatial/query/wallContext.js";

/**
 * Insert combatants and pickups into a spatial frame for the current tick.
 * Mutates `combatants` and `pushables` arrays (reused each frame).
 *
 * @param {import("../../Libraries/Spatial/world/SpatialFrameCore.js").SpatialFrameCore} frame
 * @param {object} state
 * @param {object[]} combatants
 * @param {object[]} pushables
 */
export function populateCombatFrame(frame, state, combatants, pushables) {
    frame.resetFrame(state.obstacleGrid);
    frame.setWallContext(wallContextFromState(state));
    combatants.length = 0;
    pushables.length = 0;
    let physIdCounter = 0;
    for (const actor of state.getCombatants()) {
        if (!actor?.isDead) {
            frame.insertEntity(actor, physIdCounter++);
            combatants.push(actor);
        }
    }
    for (const pickup of state.pickups) {
        if (pickup.isDead) continue;
        frame.insertEntity(pickup, physIdCounter++);
        if (pickup.strategy?.isPushable && !pickup.isSleeping) {
            pushables.push(pickup);
        }
    }
}
