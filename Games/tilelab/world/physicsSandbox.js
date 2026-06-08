import { Pickup } from "../../../Entities/Pickup.js";
import { getPropAsset } from "../../../Libraries/Content/PropCatalog.js";
import { applyDragLaunchVelocity, createDragLaunchAim, getDragLaunchConfig, releaseDragLaunch, updateDragLaunchAim } from "../../../Libraries/Props/dragLaunchToy.js";
import { canvasClientToWorld } from "../ui/labCanvas.js";
import { LAB_PHYSICS_PROP_TYPE } from "../config.js";
/** @param {import("../TileLabGameState.js").TileLabGameState} state */
export function clearLabPhysics(state) {
    state.pickups = [];
    state.labDragLaunch = null;
}
/**
 * @param {import("../TileLabGameState.js").TileLabGameState} state
 * @param {number} worldX
 * @param {number} worldY
 * @param {string} [type]
 */
export function spawnLabProp(state, worldX, worldY, type = LAB_PHYSICS_PROP_TYPE) {
    if (!getPropAsset(type)) return null;
    const prop = new Pickup(worldX, worldY, type, 0);
    state.pickups.push(prop);
    return prop;
}
/** @param {import("../TileLabGameState.js").TileLabGameState} state @param {() => void} [onRedraw] */
export function initLabDragLaunchToy(state, onRedraw) {
    const canvas = document.getElementById("gameCanvas");
    if (!canvas) return;
    const launchConfig = () => getDragLaunchConfig(getPropAsset(LAB_PHYSICS_PROP_TYPE));
    const worldFromEvent = (e) => {
        state.mapViewport.setCanvasSize(canvas.width, canvas.height);
        return canvasClientToWorld(canvas, state.mapViewport, e.clientX, e.clientY);
    };
    canvas.addEventListener(
        "pointerdown",
        (e) => {
            if (e.button !== 0 || state.labShowTopologyOverlay) return;
            const world = worldFromEvent(e);
            if (!world) return;
            e.preventDefault();
            e.stopPropagation();
            state.labDragLaunch = createDragLaunchAim(world.x, world.y);
            canvas.setPointerCapture(e.pointerId);
            onRedraw?.();
        },
        true,
    );
    canvas.addEventListener(
        "pointermove",
        (e) => {
            if (!state.labDragLaunch?.active) return;
            const world = worldFromEvent(e);
            if (!world) return;
            e.stopPropagation();
            updateDragLaunchAim(state.labDragLaunch, world.x, world.y, launchConfig());
            onRedraw?.();
        },
        true,
    );
    const finishAim = (e) => {
        const aim = state.labDragLaunch;
        if (!aim?.active) return;
        const world = worldFromEvent(e);
        if (world) updateDragLaunchAim(aim, world.x, world.y, launchConfig());
        const shot = releaseDragLaunch(aim, launchConfig());
        state.labDragLaunch = null;
        if (shot) {
            const prop = spawnLabProp(state, shot.anchorX, shot.anchorY);
            if (prop) applyDragLaunchVelocity(prop, shot.nx, shot.ny, shot.power);
        }
        if (canvas.hasPointerCapture?.(e.pointerId))
            try {
                canvas.releasePointerCapture(e.pointerId);
            } catch {
                // ignore
            }
        e.stopPropagation();
        onRedraw?.();
    };
    canvas.addEventListener("pointerup", finishAim, true);
    canvas.addEventListener("pointercancel", finishAim, true);
}
