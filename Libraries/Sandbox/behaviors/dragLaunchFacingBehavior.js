import { applyDragLaunchVelocity, createDragLaunchInteraction, dragLaunchAimLineContextForState, getDragLaunchConfig } from "../dragLaunch.js";
import propCatalog from "../../../Assets/props/index.js";
export const DRAG_LAUNCH_FACING_BEHAVIOR_ID = "dragLaunchFacing";
/** @param {object} state @returns {import("../sandboxCapabilities.js").SandboxBehavior} */
export function createDragLaunchFacingBehavior(state) {
    return createDragLaunchInteraction({
        id: DRAG_LAUNCH_FACING_BEHAVIOR_ID,
        getConfig: (prop) => getDragLaunchConfig(propCatalog[prop.type]),
        buildAimLineContext: dragLaunchAimLineContextForState(state),
        onLaunch(prop, shot) {
            prop.facing = Math.atan2(shot.ny, shot.nx);
            prop.angularVelocity = 0;
            prop.strategy.syncCollisionShape?.(prop);
            applyDragLaunchVelocity(prop, shot.nx, shot.ny, shot.power);
        },
    });
}
