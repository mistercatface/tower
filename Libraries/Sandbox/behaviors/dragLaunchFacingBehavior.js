import { getPropAsset } from "../../Props/PropCatalog.js";
import { applyDragLaunchVelocity, createDragLaunchInteraction, getDragLaunchConfig } from "../dragLaunch.js";
export const DRAG_LAUNCH_FACING_BEHAVIOR_ID = "dragLaunchFacing";
/** @returns {import("../createSandboxController.js").SandboxBehavior} */
export function createDragLaunchFacingBehavior() {
    return createDragLaunchInteraction({
        id: DRAG_LAUNCH_FACING_BEHAVIOR_ID,
        getConfig: (pickup) => getDragLaunchConfig(getPropAsset(pickup.type)),
        onLaunch(pickup, shot) {
            pickup.facing = Math.atan2(shot.ny, shot.nx);
            pickup.angularVelocity = 0;
            pickup.strategy.syncCollisionShape?.(pickup);
            applyDragLaunchVelocity(pickup, shot.nx, shot.ny, shot.power);
        },
    });
}
