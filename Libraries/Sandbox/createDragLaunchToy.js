import { Pickup } from "../../Entities/Pickup.js";
import { getPropAsset } from "../Props/PropCatalog.js";
import { getDefaultDragLaunchPropId } from "./dragLaunchCatalog.js";
import { findPickupAt } from "./findPickupAt.js";
import { applyDragLaunchVelocity, createDragLaunchAim, drawDragLaunchPreview, getDragLaunchConfig, releaseDragLaunch, updateDragLaunchAim } from "./dragLaunch.js";
/** @typedef {import("./SandboxHostPort.js").SandboxHostPort} SandboxHostPort */
/**
 * Drag-launch sandbox toy — input, aim, spawn, overlay.
 * Props opt in via `sandbox.dragLaunch` on their asset file.
 *
 * @param {SandboxHostPort} host
 */
export function createDragLaunchToy(host) {
    /** @type {import("./dragLaunch.js").DragLaunchAim | null} */
    let aim = null;
    let focusedPropId = getDefaultDragLaunchPropId();
    /** @type {(() => void)[]} */
    const unbind = [];
    const launchConfig = () => getDragLaunchConfig(getPropAsset(focusedPropId));
    const spawnFocusedProp = (worldX, worldY) => {
        if (!getPropAsset(focusedPropId)) return null;
        const prop = new Pickup(worldX, worldY, focusedPropId, 0);
        host.addPickup(prop);
        return prop;
    };
    /** @param {PointerEvent} e */
    const onPointerDown = (e) => {
        if (host.isInputBlocked()) return;
        const canvas = host.getCanvas();
        if (!canvas) return;
        const world = host.clientToWorld(e.clientX, e.clientY);
        if (!world) return;
        if (e.button === 2) {
            const hit = findPickupAt(host.getPickups(), world.x, world.y);
            if (!hit) return;
            e.preventDefault();
            e.stopPropagation();
            host.removePickup(hit);
            host.requestRedraw();
            return;
        }
        if (e.button !== 0) return;
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
        getFocusedPropId: () => focusedPropId,
        setFocusedPropId: (id) => {
            focusedPropId = id;
        },
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
