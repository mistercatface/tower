import { wallContextFromState } from "../../Libraries/Spatial/query/wallContext.js";
/**
 * Insert combatants and world props into a spatial frame for the current tick.
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
    state.entityRegistry.forEachOfKind("worldProp", (prop) => {
        if (!prop || prop.isDead || prop.isHeld) return;
        frame.insertEntity(prop, physIdCounter++);
        combatants.push(prop);
        if (prop.strategy?.isPushable) pushables.push(prop);
    });
}
