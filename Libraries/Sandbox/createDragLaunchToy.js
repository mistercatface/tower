import { Pickup } from "../../Entities/Pickup.js";
import { getPropAsset } from "../Content/PropCatalog.js";
import { applyDragLaunchVelocity, createDragLaunchAim, drawDragLaunchPreview, getDragLaunchConfig, releaseDragLaunch, updateDragLaunchAim } from "../Props/dragLaunchToy.js";
/** @typedef {import("./SandboxHostPort.js").SandboxHostPort} SandboxHostPort */
/**
 * Drag-launch sandbox toy — owns pointer input, aim state, spawn, and overlay draw.
 * Launch tuning defaults live in dragLaunchToy.js; props opt in via `sandbox.dragLaunch`.
 *
 * @param {SandboxHostPort} host
 */
export function createDragLaunchToy(host) {
    /** @type {import("../Props/dragLaunchToy.js").DragLaunchAim | null} */
    let aim = null;
    /** @type {(() => void)[]} */
    const unbind = [];
    const launchConfig = () => getDragLaunchConfig(getPropAsset(host.getFocusedPropId()));
    const spawnFocusedProp = (worldX, worldY) => {
        const type = host.getFocusedPropId();
        if (!getPropAsset(type)) return null;
        const prop = new Pickup(worldX, worldY, type, 0);
        host.addPickup(prop);
        return prop;
    };
    /** @param {PointerEvent} e */
    const onPointerDown = (e) => {
        if (e.button !== 0 || host.isInputBlocked()) return;
        const canvas = host.getCanvas();
        if (!canvas) return;
        const world = host.clientToWorld(e.clientX, e.clientY);
        if (!world) return;
        e.preventDefault();
        e.stopPropagation();
        aim = createDragLaunchAim(world.x, world.y);
        canvas.setPointerCapture(e.pointerId);
        host.requestRedraw();
    };
    /** @param {PointerEvent} e */
    const onPointerMove = (e) => {
        if (!aim?.active) return;
        const world = host.clientToWorld(e.clientX, e.clientY);
        if (!world) return;
        e.stopPropagation();
        updateDragLaunchAim(aim, world.x, world.y, launchConfig());
        host.requestRedraw();
    };
    /** @param {PointerEvent} e */
    const finishAim = (e) => {
        if (!aim?.active) return;
        const canvas = host.getCanvas();
        const world = host.clientToWorld(e.clientX, e.clientY);
        if (world) updateDragLaunchAim(aim, world.x, world.y, launchConfig());
        const shot = releaseDragLaunch(aim, launchConfig());
        aim = null;
        if (shot) {
            const prop = spawnFocusedProp(shot.anchorX, shot.anchorY);
            if (prop) applyDragLaunchVelocity(prop, shot.nx, shot.ny, shot.power);
        }
        if (canvas?.hasPointerCapture?.(e.pointerId))
            try {
                canvas.releasePointerCapture(e.pointerId);
            } catch {
                // ignore
            }
        e.stopPropagation();
        host.requestRedraw();
    };
    const bind = (type, handler) => {
        const canvas = host.getCanvas();
        if (!canvas) return;
        canvas.addEventListener(type, handler, true);
        unbind.push(() => canvas.removeEventListener(type, handler, true));
    };
    return {
        register() {
            bind("pointerdown", onPointerDown);
            bind("pointermove", onPointerMove);
            bind("pointerup", finishAim);
            bind("pointercancel", finishAim);
        },
        destroy() {
            while (unbind.length) unbind.pop()?.();
            aim = null;
        },
        clearBodies() {
            host.clearPickups();
            aim = null;
        },
        /** @param {CanvasRenderingContext2D} ctx */
        drawOverlay(ctx) {
            if (!aim?.active) return;
            drawDragLaunchPreview(ctx, aim, launchConfig());
        },
    };
}
