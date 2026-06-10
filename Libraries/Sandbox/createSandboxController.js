import { getPropAsset } from "../Props/PropCatalog.js";
import { bindCanvasPointers, releasePointerCapture } from "./bindCanvasPointers.js";
import { findPickupAt } from "./findPickupAt.js";
import { createSandboxSession } from "./sandboxSession.js";
import { resolveSandboxBehaviors } from "./sandboxCapabilities.js";
import { drawSandboxLaserSights } from "./drawLaserSights.js";
import { drawSandboxPathOverlay } from "./drawSandboxPathOverlay.js";
import { drawSandboxWeaponBars } from "./drawPickupWeaponBars.js";
import { resolveSandboxPathVisual, setSandboxPathVisual } from "./sandboxPathVisual.js";
/** @typedef {import("./SandboxHostPort.js").SandboxHostPort} SandboxHostPort */
/**
 * @typedef {object} SandboxBehavior
 * @property {string} id
 * @property {(pickup: object | null, asset: object) => boolean} [supports]
 * @property {(pickup: object, world: { x: number, y: number }, e: PointerEvent, host: SandboxHostPort) => boolean} onPointerDown
 * @property {(pickup: object, world: { x: number, y: number }, e: PointerEvent) => void} onPointerMove
 * @property {(pickup: object, e: PointerEvent) => void} onPointerUp
 * @property {(pickup: object, dt: number, host: SandboxHostPort) => void} [tick]
 * @property {(ctx: CanvasRenderingContext2D, pickup: object, host: SandboxHostPort) => void} [drawOverlay]
 * @property {(pickup: object, host: SandboxHostPort) => import("../../Render/map/topology/drawActivePathOverlay.js").ActivePathOverlay | null} [getPathOverlay]
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
    const contextAsset = () => {
        const pickup = session.getSelectedPickup();
        if (pickup) return getPropAsset(pickup.type);
        return getPropAsset(session.getSpawnPropId());
    };
    const listBehaviorsForContext = () => resolveSandboxBehaviors(contextAsset(), behaviors, session.getSelectedPickup());
    const clampActiveBehavior = () => {
        const allowed = listBehaviorsForContext();
        if (allowed.length === 0) return;
        if (!allowed.includes(activeBehaviorId)) activeBehaviorId = allowed[0];
    };
    clampActiveBehavior();
    const selectPickup = (id) => {
        session.setSelectedPickupId(id);
        clampActiveBehavior();
    };
    const resolveBehavior = () => {
        clampActiveBehavior();
        const behavior = behaviorById.get(activeBehaviorId) ?? null;
        if (!behavior) return null;
        if (!listBehaviorsForContext().includes(behavior.id)) return null;
        return behavior;
    };
    const resetBehaviors = () => {
        for (const behavior of behaviors) behavior.reset?.();
        interactionBehavior = null;
    };
    /** @param {PointerEvent} e */
    const onPointerDown = (e) => {
        if (host.isInputBlocked?.()) return;
        const canvas = host.getCanvas();
        const world = host.clientToWorld(e.clientX, e.clientY);
        if (e.button === 2) {
            const hit = findPickupAt(host.getPickups(), world.x, world.y);
            if (!hit) return;
            e.preventDefault();
            e.stopPropagation();
            session.deletePickup(hit);
            return;
        }
        if (e.button !== 0) return;
        session.pruneSelection();
        const hit = findPickupAt(host.getPickups(), world.x, world.y);
        if (hit) {
            const allowed = resolveSandboxBehaviors(getPropAsset(hit.type), behaviors, hit);
            if (allowed.length > 0) selectPickup(hit.id);
        }
        const pickup = session.getSelectedPickup();
        const behavior = resolveBehavior();
        if (!pickup || !behavior) return;
        if (!behavior.onPointerDown(pickup, world, e, host)) return;
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
        e.stopPropagation();
        interactionBehavior.onPointerMove(pickup, world, e);
    };
    /** @param {PointerEvent} e */
    const onPointerUp = (e) => {
        if (!interactionBehavior) return;
        const canvas = host.getCanvas();
        const pickup = session.getSelectedPickup();
        if (pickup) {
            const world = host.clientToWorld(e.clientX, e.clientY);
            interactionBehavior.onPointerMove(pickup, world, e);
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
        setSpawnPropId: (id) => {
            session.setSpawnPropId(id);
            clampActiveBehavior();
        },
        getSpawnFaction: () => session.getSpawnFaction(),
        setSpawnFaction: (faction) => session.setSpawnFaction(faction),
        getSelectedPickupId: () => session.getSelectedPickupId(),
        getSelectedPickup: () => session.getSelectedPickup(),
        setSelectedPickupId: (id) => {
            selectPickup(id);
        },
        spawnAtCameraOrigin: () => session.spawnAtCameraOrigin(),
        spawnVoidAtCameraOrigin: () => session.spawnVoidAtCameraOrigin(),
        spawnAssemblyAtCameraOrigin: (assemblyId) => {
            const instance = session.spawnAssemblyAtCameraOrigin(assemblyId);
            clampActiveBehavior();
            return instance;
        },
        listAssemblyManifests: () => session.listAssemblyManifests(),
        deleteVoidZoneById: (id) => session.deleteVoidZoneById(id),
        deleteAssemblyById: (id) => session.deleteAssemblyById(id),
        listVoidZones: () => session.listVoidZones(),
        listAssemblies: () => session.listAssemblies(),
        deletePickupById: (id) => session.deletePickupById(id),
        listPlacedPickups: () => session.listPlacedPickups(),
        sync: () => session.sync(),
        setUiSync: (fn) => session.setUiSync(fn),
        getActiveBehaviorId: () => {
            clampActiveBehavior();
            return activeBehaviorId;
        },
        setActiveBehaviorId: (id) => {
            const allowed = listBehaviorsForContext();
            activeBehaviorId = allowed.includes(id) ? id : (allowed[0] ?? id);
            session.sync();
        },
        listBehaviors: () => listBehaviorsForContext(),
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
            session.pruneSelection();
            const pickup = session.getSelectedPickup();
            const behavior = resolveBehavior();
            if (!pickup || !behavior?.tick) return;
            behavior.tick(pickup, dt, host);
        },
        /** @param {CanvasRenderingContext2D} ctx */
        drawPathOverlay(ctx) {
            const pickup = session.getSelectedPickup();
            const behavior = resolveBehavior();
            if (pickup) drawSandboxPathOverlay(ctx, pickup, behavior, host);
        },
        /** Drag-launch aim preview — same layer as path overlays (above floors, below walls). */
        drawLaunchPreview(ctx) {
            const pickup = session.getSelectedPickup();
            const behavior = resolveBehavior();
            behavior?.drawOverlay?.(ctx, pickup, host);
        },
        drawOverlay(ctx) {
            drawSandboxWeaponBars(ctx, host);
            drawSandboxLaserSights(ctx, host);
        },
        getPathVisual(pickup = session.getSelectedPickup()) {
            return pickup ? resolveSandboxPathVisual(pickup) : "off";
        },
        setPathVisual(visual, pickup = session.getSelectedPickup()) {
            if (!pickup) return;
            setSandboxPathVisual(pickup, visual);
            session.sync();
        },
    };
    return controller;
}
