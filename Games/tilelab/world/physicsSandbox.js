import { Pickup } from "../../../Entities/Pickup.js";
import { wakePushableBody } from "../../../Libraries/Motion/pushableSleep.js";
import { getPropAsset } from "../../../Libraries/Content/PropCatalog.js";
import { canvasClientToWorld } from "../ui/labCanvas.js";
import { LAB_PHYSICS_PROP_TYPE } from "../config.js";
/** @param {import("../TileLabGameState.js").TileLabGameState} state */
export function clearLabPhysics(state) {
    state.pickups = [];
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
    wakePushableBody(prop);
    state.pickups.push(prop);
    return prop;
}
/** @param {import("../TileLabGameState.js").TileLabGameState} state @param {() => void} [onRedraw] */
export function initPhysicsSpawning(state, onRedraw) {
    const canvas = document.getElementById("gameCanvas");
    canvas?.addEventListener(
        "pointerdown",
        (e) => {
            if (!e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            state.mapViewport.setCanvasSize(canvas.width, canvas.height);
            const world = canvasClientToWorld(canvas, state.mapViewport, e.clientX, e.clientY);
            if (world && spawnLabProp(state, world.x, world.y)) onRedraw?.();
        },
        true,
    );
}
