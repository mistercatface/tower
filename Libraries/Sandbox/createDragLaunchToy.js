import { Pickup } from "../../Entities/Pickup.js";
import { getPropAsset } from "../Props/PropCatalog.js";
import { getDefaultDragLaunchPropId } from "./dragLaunchCatalog.js";
import { findPickupAt } from "./findPickupAt.js";
import { applyDragLaunchVelocity, createDragLaunchAim, drawDragLaunchPreview, getDragLaunchConfig, isDragLaunchProp, releaseDragLaunch, updateDragLaunchAim } from "./dragLaunch.js";
/** @typedef {import("./SandboxHostPort.js").SandboxHostPort} SandboxHostPort */
/**
 * Drag-launch sandbox toy — spawn via UI, interact with selected instance on canvas.
 *
 * @param {SandboxHostPort} host
 */
export function createDragLaunchToy(host) {
    /** @type {import("./dragLaunch.js").DragLaunchAim | null} */
    let aim = null;
    let spawnPropId = getDefaultDragLaunchPropId();
    /** @type {number | null} */
    let selectedPickupId = null;
    /** @type {(() => void) | null} */
    let uiSync = null;
    /** @type {(() => void)[]} */
    const unbind = [];
    const sync = () => {
        host.requestRedraw();
        uiSync?.();
    };
    const getSelectedPickup = () => host.getPickups().find((p) => p.id === selectedPickupId) ?? null;
    const launchConfig = () => {
        const pickup = getSelectedPickup();
        return getDragLaunchConfig(pickup ? getPropAsset(pickup.type) : null);
    };
    const spawnProp = (worldX, worldY) => {
        if (!getPropAsset(spawnPropId)) return null;
        const prop = new Pickup(worldX, worldY, spawnPropId, 0);
        host.addPickup(prop);
        selectedPickupId = prop.id;
        sync();
        return prop;
    };
    const deletePickup = (pickup) => {
        if (!pickup) return;
        host.removePickup(pickup);
        if (selectedPickupId === pickup.id) selectedPickupId = host.getPickups()[0]?.id ?? null;
        sync();
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
            deletePickup(hit);
            return;
        }
        if (e.button !== 0) return;
        const pickup = getSelectedPickup();
        if (!pickup || !isDragLaunchProp(getPropAsset(pickup.type))) return;
        e.preventDefault();
        e.stopPropagation();
        aim = createDragLaunchAim(pickup.x, pickup.y);
        updateDragLaunchAim(aim, world.x, world.y, launchConfig());
        canvas.setPointerCapture(e.pointerId);
        sync();
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
            const pickup = getSelectedPickup();
            if (pickup) applyDragLaunchVelocity(pickup, shot.nx, shot.ny, shot.power);
        }
        if (canvas?.hasPointerCapture?.(e.pointerId))
            try {
                canvas.releasePointerCapture(e.pointerId);
            } catch {
                // ignore
            }
        e.stopPropagation();
        sync();
    };
    const bind = (type, handler) => {
        const canvas = host.getCanvas();
        if (!canvas) return;
        canvas.addEventListener(type, handler, true);
        unbind.push(() => canvas.removeEventListener(type, handler, true));
    };
    return {
        getSpawnPropId: () => spawnPropId,
        setSpawnPropId: (id) => {
            spawnPropId = id;
        },
        getSelectedPickupId: () => selectedPickupId,
        setSelectedPickupId: (id) => {
            selectedPickupId = id;
            sync();
        },
        spawnAtCameraOrigin() {
            const origin = host.getCameraOrigin?.();
            if (!origin) return null;
            return spawnProp(origin.x, origin.y);
        },
        deletePickupById(id) {
            const pickup = host.getPickups().find((p) => p.id === id);
            deletePickup(pickup);
        },
        listPlacedPickups() {
            const counts = new Map();
            return host.getPickups().map((pickup) => {
                const typeLabel = (pickup.type ?? "prop").replace(/_/g, " ");
                const index = (counts.get(pickup.type) ?? 0) + 1;
                counts.set(pickup.type, index);
                return { id: pickup.id, type: pickup.type, label: `${typeLabel} #${index}` };
            });
        },
        setUiSync(fn) {
            uiSync = fn;
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
            uiSync = null;
        },
        clearBodies() {
            host.clearPickups();
            selectedPickupId = null;
            aim = null;
            sync();
        },
        /** @param {CanvasRenderingContext2D} ctx */
        drawOverlay(ctx) {
            if (!aim?.active) return;
            drawDragLaunchPreview(ctx, aim, launchConfig());
        },
    };
}
