import { getPropAsset } from "../Props/PropCatalog.js";
import { bindCanvasPointers, releasePointerCapture } from "./bindCanvasPointers.js";
import { findPickupAt } from "./findPickupAt.js";
import { createSandboxSession, SANDBOX_SPAWN_ASSEMBLY_PREFIX } from "./sandboxSession.js";
import { addButtonPadLink, clearButtonPadLinks, drawSandboxPadWires, findButtonLinkTarget, listButtonPadLinkEndpoints, removeButtonPadLink } from "./sandboxPadLinks.js";
import { getSandboxPad, handlePadPointerDown, hitTestPad, isSandboxSpawnPadId, releaseButtonPointerHold } from "./sandboxPads.js";
import { resolveSandboxBehaviors } from "./sandboxCapabilities.js";
import { drawSandboxLaserSights } from "./drawLaserSights.js";
import { drawActivePathOverlay } from "../Render/map/drawActivePathOverlay.js";
import { drawSandboxWeaponBars } from "./drawPickupWeaponBars.js";
import { resolveSandboxPathVisual, setSandboxPathVisual } from "./sandboxPathVisual.js";
import { isSandboxCameraTarget, setSandboxCameraTarget } from "./sandboxCameraTarget.js";
/** @typedef {import("./SandboxHostPort.js").SandboxHostPort} SandboxHostPort */
/**
 * @typedef {object} SandboxBehavior
 * @property {string} id
 * @property {(pickup: object | null, asset: object) => boolean} [supports]
 * @property {(world: { x: number, y: number }, e: PointerEvent, host: SandboxHostPort) => boolean} [tryCanvasInput]
 * @property {(pickup: object, world: { x: number, y: number }, e: PointerEvent, host: SandboxHostPort) => boolean} onPointerDown
 * @property {(pickup: object, world: { x: number, y: number }, e: PointerEvent) => void} onPointerMove
 * @property {(pickup: object, e: PointerEvent, host: SandboxHostPort) => void} onPointerUp
 * @property {(pickup: object, dt: number, host: SandboxHostPort) => void} [tick]
 * @property {(dt: number, host: SandboxHostPort) => void} [tickWorld]
 * @property {(ctx: CanvasRenderingContext2D, pickup: object, host: SandboxHostPort) => void} [drawOverlay]
 * @property {(ctx: CanvasRenderingContext2D, host: SandboxHostPort) => void} [drawWorldOverlay]
 * @property {(pickup: object, host: SandboxHostPort) => import("../../Render/map/drawActivePathOverlay.js").ActivePathOverlay | null} [getPathOverlay]
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
    let spawnBehaviorId = defaultBehaviorId ?? behaviors[0]?.id ?? "";
    /** @type {SandboxBehavior | null} */
    let interactionBehavior = null;
    /** @type {(() => void) | null} */
    let unbindPointers = null;
    let padWireMode = false;
    /** @type {{ x: number, y: number } | null} */
    let padWireCursor = null;
    const spawnAsset = () => {
        const spawnId = session.getSpawnPropId();
        if (isSandboxSpawnPadId(spawnId) || spawnId.startsWith(SANDBOX_SPAWN_ASSEMBLY_PREFIX)) return null;
        return getPropAsset(spawnId);
    };
    /** @param {string} id @param {string[]} allowed */
    const clampBehaviorId = (id, allowed) => {
        if (allowed.length === 0) return id;
        return allowed.includes(id) ? id : allowed[0];
    };
    const listSpawnBehaviors = () => resolveSandboxBehaviors(spawnAsset(), behaviors, null);
    const clampSpawnBehavior = () => {
        spawnBehaviorId = clampBehaviorId(spawnBehaviorId, listSpawnBehaviors());
    };
    /** @param {object | null | undefined} pickup */
    const listSelectedBehaviors = (pickup = session.getSelectedPickup()) => {
        if (!pickup) return [];
        return resolveSandboxBehaviors(getPropAsset(pickup.type), behaviors, pickup);
    };
    /** @param {object} pickup */
    const getPickupBehaviorId = (pickup) => {
        const allowed = listSelectedBehaviors(pickup);
        if (allowed.length === 0) return spawnBehaviorId;
        return clampBehaviorId(pickup.sandboxActiveBehaviorId ?? spawnBehaviorId, allowed);
    };
    /** @param {object | null | undefined} pickup */
    const stampPickupBehavior = (pickup) => {
        if (!pickup) return;
        const allowed = listSelectedBehaviors(pickup);
        if (allowed.length === 0) return;
        pickup.sandboxActiveBehaviorId = clampBehaviorId(spawnBehaviorId, allowed);
    };
    clampSpawnBehavior();
    const resolveBehavior = () => {
        const pickup = session.getSelectedPickup();
        if (!pickup) return null;
        const allowed = listSelectedBehaviors(pickup);
        const behavior = behaviorById.get(getPickupBehaviorId(pickup)) ?? null;
        if (!behavior || !allowed.includes(behavior.id)) return null;
        return behavior;
    };
    const resetBehaviors = () => {
        for (const behavior of behaviors) behavior.reset?.();
        interactionBehavior = null;
    };
    /** @param {{ x: number, y: number }} world @param {PointerEvent} e */
    const tryCanvasInput = (world, e) => {
        for (let i = 0; i < behaviors.length; i++) if (behaviors[i].tryCanvasInput?.(world, e, host)) return true;
        return false;
    };
    /** @param {PointerEvent} e */
    const onPointerDown = (e) => {
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
        if (padWireMode) {
            const buttonPadId = session.getSelectedPadId();
            const buttonPad = buttonPadId ? getSandboxPad(host.getWorldState(), buttonPadId) : null;
            if (buttonPad?.preset === "button") {
                const target = findButtonLinkTarget(host.getWorldState(), world.x, world.y, buttonPad.id);
                if (target) addButtonPadLink(host.getWorldState(), buttonPad.id, target);
                session.sync();
                e.preventDefault();
                e.stopPropagation();
                return;
            }
        }
        const pad = hitTestPad(host.getWorldState(), world.x, world.y);
        if (pad && handlePadPointerDown(host.getWorldState(), pad, world)) {
            e.preventDefault();
            e.stopPropagation();
            session.sync();
            return;
        }
        if (tryCanvasInput(world, e)) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        session.pruneSelection();
        const hit = findPickupAt(host.getPickups(), world.x, world.y);
        if (hit) {
            const allowed = resolveSandboxBehaviors(getPropAsset(hit.type), behaviors, hit);
            if (allowed.length > 0) session.setSelectedPickupId(hit.id);
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
        if (padWireMode) {
            padWireCursor = host.clientToWorld(e.clientX, e.clientY);
            host.requestRedraw();
        }
        if (!interactionBehavior) return;
        const pickup = session.getSelectedPickup();
        if (!pickup) return;
        const world = host.clientToWorld(e.clientX, e.clientY);
        e.stopPropagation();
        interactionBehavior.onPointerMove(pickup, world, e);
    };
    /** @param {PointerEvent} e */
    const onPointerUp = (e) => {
        releaseButtonPointerHold(host.getWorldState());
        if (!interactionBehavior) return;
        const canvas = host.getCanvas();
        const pickup = session.getSelectedPickup();
        if (pickup) {
            const world = host.clientToWorld(e.clientX, e.clientY);
            interactionBehavior.onPointerMove(pickup, world, e);
            interactionBehavior.onPointerUp(pickup, e, host);
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
            clampSpawnBehavior();
        },
        getSpawnFaction: () => session.getSpawnFaction(),
        setSpawnFaction: (faction) => session.setSpawnFaction(faction),
        getSpawnPullSize: () => session.getSpawnPullSize(),
        setSpawnPullSize: (width, height) => {
            session.setSpawnPullSize(width, height);
            session.sync();
        },
        getSelectedPickupId: () => session.getSelectedPickupId(),
        getSelectedPickup: () => session.getSelectedPickup(),
        setSelectedPickupId: (id) => {
            padWireMode = false;
            padWireCursor = null;
            session.setSelectedPickupId(id);
            const pickup = session.getSelectedPickup();
            if (pickup && pickup.sandboxActiveBehaviorId == null) {
                const allowed = listSelectedBehaviors(pickup);
                if (allowed.length > 0) pickup.sandboxActiveBehaviorId = allowed[0];
            }
        },
        getSelectedPadId: () => session.getSelectedPadId(),
        setSelectedPadId: (id) => {
            padWireMode = false;
            padWireCursor = null;
            session.setSelectedPadId(id);
        },
        getSelectedPad: () => session.getSelectedPad(),
        patchSelectedPad: (patch) => session.patchSelectedPad(patch),
        startPadWireLink: () => {
            if (session.getSelectedPad()?.preset !== "button") return;
            padWireMode = true;
            padWireCursor = host.getCameraOrigin();
            session.sync();
        },
        cancelPadWireLink: () => {
            padWireMode = false;
            padWireCursor = null;
            session.sync();
        },
        isPadWireLinkActive: () => padWireMode,
        clearSelectedPadLinks: () => {
            const padId = session.getSelectedPadId();
            if (!padId) return;
            clearButtonPadLinks(host.getWorldState(), padId);
            session.sync();
        },
        removeSelectedPadLink: (target) => {
            const padId = session.getSelectedPadId();
            if (!padId) return;
            removeButtonPadLink(host.getWorldState(), padId, target);
            session.sync();
        },
        listSelectedPadLinks: () => {
            const padId = session.getSelectedPadId();
            if (!padId) return [];
            const pad = getSandboxPad(host.getWorldState(), padId);
            if (!pad) return [];
            return listButtonPadLinkEndpoints(host.getWorldState(), pad);
        },
        spawnAtCameraOrigin: () => {
            session.spawnAtCameraOrigin();
            stampPickupBehavior(session.getSelectedPickup());
        },
        spawnAssemblyAtCameraOrigin: (assemblyId) => {
            const instance = session.spawnAssemblyAtCameraOrigin(assemblyId);
            stampPickupBehavior(session.getSelectedPickup());
            return instance;
        },
        listAssemblyManifests: () => session.listAssemblyManifests(),
        deleteSandboxPadById: (id) => session.deleteSandboxPadById(id),
        listSandboxPads: () => session.listSandboxPads(),
        deleteAssemblyById: (id) => session.deleteAssemblyById(id),
        listAssemblies: () => session.listAssemblies(),
        deletePickupById: (id) => session.deletePickupById(id),
        listPlacedPickups: () => session.listPlacedPickups(),
        sync: () => session.sync(),
        setUiSync: (fn) => session.setUiSync(fn),
        getSpawnBehaviorId: () => {
            clampSpawnBehavior();
            return spawnBehaviorId;
        },
        setSpawnBehaviorId: (id) => {
            spawnBehaviorId = clampBehaviorId(id, listSpawnBehaviors());
            session.sync();
        },
        listSpawnBehaviors,
        getSelectedBehaviorId: () => {
            const pickup = session.getSelectedPickup();
            return pickup ? getPickupBehaviorId(pickup) : spawnBehaviorId;
        },
        setSelectedBehaviorId: (id) => {
            const pickup = session.getSelectedPickup();
            if (!pickup) return;
            pickup.sandboxActiveBehaviorId = clampBehaviorId(id, listSelectedBehaviors(pickup));
            session.sync();
        },
        listSelectedBehaviors: () => listSelectedBehaviors(),
        register() {
            controller.destroy();
            unbindPointers = bindCanvasPointers(host, { pointerdown: onPointerDown, pointermove: onPointerMove, pointerup: onPointerUp, pointercancel: onPointerUp });
        },
        destroy() {
            unbindPointers?.();
            unbindPointers = null;
            padWireMode = false;
            padWireCursor = null;
            resetBehaviors();
            session.setUiSync(null);
        },
        clearBodies() {
            session.clear();
            resetBehaviors();
        },
        tick(dt) {
            session.pruneSelection();
            for (let i = 0; i < behaviors.length; i++) behaviors[i].tickWorld?.(dt, host);
            const pickup = session.getSelectedPickup();
            const behavior = resolveBehavior();
            if (!pickup || !behavior?.tick) return;
            behavior.tick(pickup, dt, host);
        },
        /** @param {CanvasRenderingContext2D} ctx */
        drawPathOverlay(ctx) {
            const pickup = session.getSelectedPickup();
            const behavior = resolveBehavior();
            if (!pickup) return;
            const visual = resolveSandboxPathVisual(pickup);
            if (visual === "off" || !behavior?.getPathOverlay) return;
            const overlay = behavior.getPathOverlay(pickup, host);
            if (!overlay) return;
            drawActivePathOverlay(ctx, overlay, host.getWorldState().viewport.zoom, visual);
        },
        /** Drag-launch aim preview — above world structure (walls/props/pit rims). */
        drawLaunchPreview(ctx) {
            const pickup = session.getSelectedPickup();
            const behavior = resolveBehavior();
            behavior?.drawOverlay?.(ctx, pickup, host);
        },
        drawBehaviorOverlays(ctx) {
            drawSandboxPadWires(ctx, host.getWorldState(), { wireFromPadId: padWireMode ? session.getSelectedPadId() : null, wireCursor: padWireMode ? padWireCursor : null });
            for (let i = 0; i < behaviors.length; i++) behaviors[i].drawWorldOverlay?.(ctx, host);
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
        isCameraTarget(pickup = session.getSelectedPickup()) {
            return pickup ? isSandboxCameraTarget(pickup) : false;
        },
        setCameraTarget(enabled, pickup = session.getSelectedPickup()) {
            if (!pickup) return;
            setSandboxCameraTarget(pickup, enabled, host.getPickups());
            if (enabled) host.getWorldState().viewport.snapTo(pickup.x, pickup.y);
            session.sync();
        },
    };
    return controller;
}
