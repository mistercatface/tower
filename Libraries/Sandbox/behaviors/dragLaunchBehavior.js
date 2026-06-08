import { getPropAsset } from "../../Props/PropCatalog.js";
import { applyDragLaunchVelocity, createDragLaunchAim, drawDragLaunchPreview, getDragLaunchConfig, releaseDragLaunch, updateDragLaunchAim } from "../dragLaunch.js";
export const DRAG_LAUNCH_BEHAVIOR_ID = "dragLaunch";
/** @returns {import("../createSandboxController.js").SandboxBehavior} */
export function createDragLaunchBehavior() {
    /** @type {import("../dragLaunch.js").DragLaunchAim | null} */
    let aim = null;
    const configFor = (pickup) => getDragLaunchConfig(getPropAsset(pickup?.type));
    return {
        id: DRAG_LAUNCH_BEHAVIOR_ID,
        onPointerDown(pickup, world) {
            aim = createDragLaunchAim(pickup.x, pickup.y);
            updateDragLaunchAim(aim, world.x, world.y, configFor(pickup));
            return true;
        },
        onPointerMove(_pickup, world) {
            if (!aim?.active) return;
            updateDragLaunchAim(aim, world.x, world.y, configFor(_pickup));
        },
        onPointerUp(pickup) {
            if (!aim?.active) return;
            const shot = releaseDragLaunch(aim, configFor(pickup));
            aim = null;
            if (shot) applyDragLaunchVelocity(pickup, shot.nx, shot.ny, shot.power);
        },
        drawOverlay(ctx, pickup) {
            if (!aim?.active) return;
            drawDragLaunchPreview(ctx, aim, configFor(pickup));
        },
        reset() {
            aim = null;
        },
    };
}
