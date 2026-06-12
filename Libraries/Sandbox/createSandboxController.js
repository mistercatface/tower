import { getPropAsset } from "../Props/PropCatalog.js";
import { bindCanvasPointers, releasePointerCapture } from "./bindCanvasPointers.js";
import { findWorldPropAtInView } from "../../GameState/EntityRegistry.js";
import { combatSpatial } from "../../Systems/World/CombatSpatialFrame.js";
import { createSandboxSession, SANDBOX_SPAWN_ASSEMBLY_PREFIX } from "./sandboxSession.js";
import { addButtonPadLink, clearButtonPadLinks, drawSandboxPadWires, findButtonLinkTarget, listButtonPadLinkEndpoints, removeButtonPadLink } from "./sandboxPadLinks.js";
import { handlePadPointerDown, hitTestPad, isSandboxSpawnPadId, releaseButtonPointerHold } from "./sandboxPads.js";
import { resolveSandboxBehaviors } from "./sandboxCapabilities.js";
import { drawSandboxLaserSights } from "./drawLaserSights.js";
import { drawActivePathOverlay } from "../Render/map/drawActivePathOverlay.js";
import { drawSandboxWeaponBars } from "./drawWorldPropWeaponBars.js";
import { resolveSandboxPathVisual, setSandboxPathVisual } from "./sandboxPathVisual.js";
import { isSandboxCameraTarget, setSandboxCameraTarget } from "./sandboxCameraTarget.js";
/** @typedef {import("./SandboxHostPort.js").SandboxHostPort} SandboxHostPort */
/**
 * @typedef {object} SandboxBehavior
 * @property {string} id
 * @property {(prop: object | null, asset: object) => boolean} [supports]
 * @property {(world: { x: number, y: number }, e: PointerEvent, host: SandboxHostPort) => boolean} [tryCanvasInput]
 * @property {(prop: object, world: { x: number, y: number }, e: PointerEvent, host: SandboxHostPort) => boolean} onPointerDown
 * @property {(prop: object, world: { x: number, y: number }, e: PointerEvent) => void} onPointerMove
 * @property {(prop: object, e: PointerEvent, host: SandboxHostPort) => void} onPointerUp
 * @property {(prop: object, dt: number, host: SandboxHostPort) => void} [tick]
 * @property {(dt: number, host: SandboxHostPort) => void} [tickWorld]
 * @property {(ctx: CanvasRenderingContext2D, prop: object, host: SandboxHostPort) => void} [drawOverlay]
 * @property {(ctx: CanvasRenderingContext2D, host: SandboxHostPort) => void} [drawWorldOverlay]
 * @property {(prop: object, host: SandboxHostPort) => import("../../Render/map/drawActivePathOverlay.js").ActivePathOverlay | null} [getPathOverlay]
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
    /** @param {object | null | undefined} prop */
    const listSelectedBehaviors = (prop = session.getSelectedProp()) => {
        if (!prop) return [];
        return resolveSandboxBehaviors(getPropAsset(prop.type), behaviors, prop);
    };
    /** @param {object} prop */
    const getPropBehaviorId = (prop) => {
        const allowed = listSelectedBehaviors(prop);
        if (allowed.length === 0) return spawnBehaviorId;
        return clampBehaviorId(prop.sandboxActiveBehaviorId ?? spawnBehaviorId, allowed);
    };
    /** @param {object | null | undefined} prop */
    const stampPropBehavior = (prop) => {
        if (!prop) return;
        const allowed = listSelectedBehaviors(prop);
        if (allowed.length === 0) return;
        prop.sandboxActiveBehaviorId = clampBehaviorId(spawnBehaviorId, allowed);
    };
    clampSpawnBehavior();
    const resolveBehavior = () => {
        const prop = session.getSelectedProp();
        if (!prop) return null;
        const allowed = listSelectedBehaviors(prop);
        const behavior = behaviorById.get(getPropBehaviorId(prop)) ?? null;
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
        const registry = host.getWorldState().entityRegistry;
        if (e.button === 2) {
            const hit = findWorldPropAtInView(registry, combatSpatial, world.x, world.y);
            if (!hit) return;
            e.preventDefault();
            e.stopPropagation();
            session.deleteProp(hit);
            return;
        }
        if (e.button !== 0) return;
        if (padWireMode) {
            const buttonPadId = session.getSelectedPadId();
            const buttonPad = buttonPadId ? host.getWorldState().entityRegistry.get(buttonPadId) : null;
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
        const hit = findWorldPropAtInView(registry, combatSpatial, world.x, world.y);
        if (hit) {
            const allowed = resolveSandboxBehaviors(getPropAsset(hit.type), behaviors, hit);
            if (allowed.length > 0) session.setSelectedPropId(hit.id);
        }
        const prop = session.getSelectedProp();
        const behavior = resolveBehavior();
        if (!prop || !behavior) return;
        if (!behavior.onPointerDown(prop, world, e, host)) return;
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
        const prop = session.getSelectedProp();
        if (!prop) return;
        const world = host.clientToWorld(e.clientX, e.clientY);
        e.stopPropagation();
        interactionBehavior.onPointerMove(prop, world, e);
    };
    /** @param {PointerEvent} e */
    const onPointerUp = (e) => {
        releaseButtonPointerHold(host.getWorldState());
        if (!interactionBehavior) return;
        const canvas = host.getCanvas();
        const prop = session.getSelectedProp();
        if (prop) {
            const world = host.clientToWorld(e.clientX, e.clientY);
            interactionBehavior.onPointerMove(prop, world, e);
            interactionBehavior.onPointerUp(prop, e, host);
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
        getSelectedPropId: () => session.getSelectedPropId(),
        getSelectedProp: () => session.getSelectedProp(),
        setSelectedPropId: (id) => {
            padWireMode = false;
            padWireCursor = null;
            session.setSelectedPropId(id);
            const prop = session.getSelectedProp();
            if (prop && prop.sandboxActiveBehaviorId == null) {
                const allowed = listSelectedBehaviors(prop);
                if (allowed.length > 0) prop.sandboxActiveBehaviorId = allowed[0];
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
            const pad = host.getWorldState().entityRegistry.get(padId);
            if (!pad) return [];
            return listButtonPadLinkEndpoints(host.getWorldState(), pad);
        },
        spawnAtCameraOrigin: () => {
            session.spawnAtCameraOrigin();
            stampPropBehavior(session.getSelectedProp());
        },
        spawnAssemblyAtCameraOrigin: (assemblyId) => {
            const instance = session.spawnAssemblyAtCameraOrigin(assemblyId);
            stampPropBehavior(session.getSelectedProp());
            return instance;
        },
        listAssemblyManifests: () => session.listAssemblyManifests(),
        deleteSandboxPadById: (id) => session.deleteSandboxPadById(id),
        listSandboxPads: () => session.listSandboxPads(),
        deleteAssemblyById: (id) => session.deleteAssemblyById(id),
        listAssemblies: () => session.listAssemblies(),
        deletePropById: (id) => session.deletePropById(id),
        listPlacedProps: () => session.listPlacedProps(),
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
            const prop = session.getSelectedProp();
            return prop ? getPropBehaviorId(prop) : spawnBehaviorId;
        },
        setSelectedBehaviorId: (id) => {
            const prop = session.getSelectedProp();
            if (!prop) return;
            prop.sandboxActiveBehaviorId = clampBehaviorId(id, listSelectedBehaviors(prop));
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
            const prop = session.getSelectedProp();
            const behavior = resolveBehavior();
            if (!prop || !behavior?.tick) return;
            behavior.tick(prop, dt, host);
        },
        /** @param {CanvasRenderingContext2D} ctx */
        drawPathOverlay(ctx) {
            const prop = session.getSelectedProp();
            const behavior = resolveBehavior();
            if (!prop) return;
            const visual = resolveSandboxPathVisual(prop);
            if (visual === "off" || !behavior?.getPathOverlay) return;
            const overlay = behavior.getPathOverlay(prop, host);
            if (!overlay) return;
            drawActivePathOverlay(ctx, overlay, host.getWorldState().viewport.zoom, visual);
        },
        /** Drag-launch aim preview — above world structure (walls/props/pit rims). */
        drawLaunchPreview(ctx) {
            const prop = session.getSelectedProp();
            const behavior = resolveBehavior();
            behavior?.drawOverlay?.(ctx, prop, host);
        },
        drawBehaviorOverlays(ctx) {
            drawSandboxPadWires(ctx, host.getWorldState(), { wireFromPadId: padWireMode ? session.getSelectedPadId() : null, wireCursor: padWireMode ? padWireCursor : null });
            for (let i = 0; i < behaviors.length; i++) behaviors[i].drawWorldOverlay?.(ctx, host);
        },
        drawOverlay(ctx) {
            drawSandboxWeaponBars(ctx, host);
            drawSandboxLaserSights(ctx, host);
        },
        getPathVisual(prop = session.getSelectedProp()) {
            return prop ? resolveSandboxPathVisual(prop) : "off";
        },
        setPathVisual(visual, prop = session.getSelectedProp()) {
            if (!prop) return;
            setSandboxPathVisual(prop, visual);
            session.sync();
        },
        isCameraTarget(prop = session.getSelectedProp()) {
            return prop ? isSandboxCameraTarget(prop) : false;
        },
        setCameraTarget(enabled, prop = session.getSelectedProp()) {
            if (!prop) return;
            setSandboxCameraTarget(prop, enabled, host.getWorldState().entityRegistry);
            if (enabled) host.getWorldState().viewport.snapTo(prop.x, prop.y);
            session.sync();
        },
    };
    return controller;
}
