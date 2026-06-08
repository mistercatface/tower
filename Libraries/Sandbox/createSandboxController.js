import { bindCanvasPointers, releasePointerCapture } from "./bindCanvasPointers.js";
import { findPickupAt } from "./findPickupAt.js";
import { createSandboxSession } from "./sandboxSession.js";
/** @typedef {import("./SandboxHostPort.js").SandboxHostPort} SandboxHostPort */
/**
 * @typedef {object} SandboxBehavior
 * @property {string} id
 * @property {(pickup: object, world: { x: number, y: number }, e: PointerEvent) => boolean} onPointerDown
 * @property {(pickup: object, world: { x: number, y: number }, e: PointerEvent) => void} onPointerMove
 * @property {(pickup: object, e: PointerEvent) => void} onPointerUp
 * @property {(pickup: object, dt: number, host: SandboxHostPort) => void} [tick]
 * @property {(ctx: CanvasRenderingContext2D, pickup: object, host: SandboxHostPort) => void} [drawOverlay]
 * @property {() => void} [reset]
 */
/**
 * @param {SandboxHostPort} host
 * @param {{
 *   defaultSpawnPropId: string,
 *   behaviors: SandboxBehavior[],
 *   defaultBehaviorId?: string,
 * }} options
 */
export function createSandboxController(host, { defaultSpawnPropId, behaviors, defaultBehaviorId }) {
    const session = createSandboxSession(host, { defaultSpawnPropId });
    const behaviorById = new Map(behaviors.map((behavior) => [behavior.id, behavior]));
    let activeBehaviorId = defaultBehaviorId ?? behaviors[0]?.id ?? "";
    /** @type {SandboxBehavior | null} */
    let interactionBehavior = null;
    /** @type {(() => void) | null} */
    let unbindPointers = null;
    const resolveBehavior = () => behaviorById.get(activeBehaviorId) ?? null;
    const resetBehaviors = () => {
        for (const behavior of behaviors) behavior.reset?.();
        interactionBehavior = null;
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
            session.deletePickup(hit);
            return;
        }
        if (e.button !== 0) return;
        const pickup = session.getSelectedPickup();
        const behavior = resolveBehavior();
        if (!pickup || !behavior) return;
        if (!behavior.onPointerDown(pickup, world, e)) return;
        e.preventDefault();
        e.stopPropagation();
        interactionBehavior = behavior;
        canvas.setPointerCapture(e.pointerId);
        session.sync();
    };
    /** @param {PointerEvent} e */
    const onPointerMove = (e) => {
        if (!interactionBehavior) return;
        const pickup = session.getSelectedPickup();
        if (!pickup) return;
        const world = host.clientToWorld(e.clientX, e.clientY);
        if (!world) return;
        e.stopPropagation();
        interactionBehavior.onPointerMove(pickup, world, e);
        host.requestRedraw();
    };
    /** @param {PointerEvent} e */
    const onPointerUp = (e) => {
        if (!interactionBehavior) return;
        const canvas = host.getCanvas();
        const pickup = session.getSelectedPickup();
        if (pickup) {
            const world = host.clientToWorld(e.clientX, e.clientY);
            if (world) interactionBehavior.onPointerMove(pickup, world, e);
            interactionBehavior.onPointerUp(pickup, e);
        }
        interactionBehavior = null;
        releasePointerCapture(canvas, e);
        e.stopPropagation();
        session.sync();
    };
    const controller = {
        session,
        getSpawnPropId: () => session.getSpawnPropId(),
        setSpawnPropId: (id) => session.setSpawnPropId(id),
        getSelectedPickupId: () => session.getSelectedPickupId(),
        setSelectedPickupId: (id) => session.setSelectedPickupId(id),
        spawnAtCameraOrigin: () => session.spawnAtCameraOrigin(),
        deletePickupById: (id) => session.deletePickupById(id),
        listPlacedPickups: () => session.listPlacedPickups(),
        setUiSync: (fn) => session.setUiSync(fn),
        getActiveBehaviorId: () => activeBehaviorId,
        setActiveBehaviorId: (id) => {
            activeBehaviorId = id;
            session.sync();
        },
        listBehaviors: () => behaviors.map(({ id }) => id),
        register() {
            controller.destroy();
            unbindPointers = bindCanvasPointers(host, { pointerdown: onPointerDown, pointermove: onPointerMove, pointerup: onPointerUp, pointercancel: onPointerUp });
        },
        destroy() {
            unbindPointers?.();
            unbindPointers = null;
            resetBehaviors();
            session.setUiSync(null);
        },
        clearBodies() {
            session.clear();
            resetBehaviors();
        },
        tick(dt) {
            const pickup = session.getSelectedPickup();
            const behavior = resolveBehavior();
            if (!pickup || !behavior?.tick) return;
            behavior.tick(pickup, dt, host);
        },
        /** @param {CanvasRenderingContext2D} ctx */
        drawOverlay(ctx) {
            const pickup = session.getSelectedPickup();
            const behavior = resolveBehavior();
            behavior?.drawOverlay?.(ctx, pickup, host);
        },
    };
    return controller;
}
