import { getPropAsset } from "../Props/PropCatalog.js";
import { bindCanvasPointers, releasePointerCapture } from "./bindCanvasPointers.js";
import { findWorldPropAtInView } from "../../GameState/EntityRegistry.js";
import { combatSpatial } from "../../Systems/World/CombatSpatialFrame.js";
import { createSandboxSession, SANDBOX_SPAWN_ASSEMBLY_PREFIX } from "./sandboxSession.js";
import { addButtonPadLink, clearButtonPadLinks, drawSandboxPadWires, findButtonLinkTarget, listButtonPadLinkEndpoints, removeButtonPadLink } from "./sandboxPadLinks.js";
import { handlePadPointerDown, hitTestPad, isSandboxSpawnPadId, releaseButtonPointerHold } from "./sandboxPads.js";
import { resolveSandboxBehaviors } from "./sandboxCapabilities.js";
import { drawSandboxLaserSights } from "./drawLaserSights.js";
import { drawSandboxMarquee, drawSandboxSelectionRings, findSandboxPropsInWorldRect } from "./drawSandboxSelection.js";
import { aabbFromTwoPointsInto, createAabb } from "../Math/Aabb2D.js";
import { drawActivePathOverlay } from "../Render/map/drawActivePathOverlay.js";
import { drawSandboxWeaponBars } from "./drawWorldPropWeaponBars.js";
import { resolveSandboxPathVisual, setSandboxPathVisual } from "./sandboxPathVisual.js";
import { isSandboxCameraTarget, setSandboxCameraTarget } from "./sandboxCameraTarget.js";
import { getSandboxEntityMeta } from "./sandboxEntityMeta.js";
/**
 * @typedef {object} SandboxBehavior
 * @property {string} id
 * @property {(prop: object | null, asset: object) => boolean} [supports]
 * @property {(world: { x: number, y: number }, e: PointerEvent) => boolean} [tryCanvasInput]
 * @property {(prop: object, world: { x: number, y: number }, e: PointerEvent) => boolean} onPointerDown
 * @property {(prop: object, world: { x: number, y: number }, e: PointerEvent) => void} onPointerMove
 * @property {(prop: object, e: PointerEvent) => void} onPointerUp
 * @property {(prop: object, dt: number) => void} [tick]
 * @property {(dt: number) => void} [tickWorld]
 * @property {(ctx: CanvasRenderingContext2D, prop: object) => void} [drawOverlay]
 * @property {(ctx: CanvasRenderingContext2D) => void} [drawWorldOverlay]
 * @property {(prop: object) => import("../../Render/map/drawActivePathOverlay.js").ActivePathOverlay | null} [getPathOverlay]
 * @property {(prop: object, world: { x: number, y: number }) => void} [setGroundMoveTarget]
 * @property {(prop: object, world: { x: number, y: number }) => void} [updateGroundMoveTarget]
 * @property {() => void} [reset]
 */
const MARQUEE_BOUNDS = createAabb();
/**
 * @param {object} state
 * @param {{
 *   requestRedraw: () => void,
 *   getCanvas: () => HTMLCanvasElement,
 *   clientToWorld: (clientX: number, clientY: number) => { x: number, y: number },
 *   defaultSpawnPropId: string,
 *   behaviors: SandboxBehavior[],
 *   defaultBehaviorId?: string,
 * }} options
 */
export function createSandboxController(state, { requestRedraw, getCanvas, clientToWorld, defaultSpawnPropId, behaviors, defaultBehaviorId }) {
    const session = createSandboxSession(state, { requestRedraw, defaultSpawnPropId });
    const behaviorById = new Map(behaviors.map((behavior) => [behavior.id, behavior]));
    let spawnBehaviorId = defaultBehaviorId ?? behaviors[0]?.id ?? "";
    /** @type {SandboxBehavior | null} */
    let interactionBehavior = null;
    /** @type {(() => void) | null} */
    let unbindPointers = null;
    let padWireMode = false;
    /** @type {{ x: number, y: number } | null} */
    let padWireCursor = null;
    let showSelectionRings = true;
    const MARQUEE_CLICK_THRESHOLD_PX = 4;
    /** @type {{ pointerId: number, startClientX: number, startClientY: number, startWorld: { x: number, y: number }, currentWorld: { x: number, y: number } } | null} */
    let marqueeSelect = null;
    /** @type {{ pointerId: number, prop: object, behavior: SandboxBehavior } | null} */
    let groundNav = null;
    const entityMeta = () => getSandboxEntityMeta(state);
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
    const listSpawnBehaviors = () => resolveSandboxBehaviors(spawnAsset(), behaviors, state, null);
    const clampSpawnBehavior = () => {
        spawnBehaviorId = clampBehaviorId(spawnBehaviorId, listSpawnBehaviors());
    };
    /** @param {object | null | undefined} prop */
    const listSelectedBehaviors = (prop = session.getSelectedProp()) => {
        if (!prop) return [];
        return resolveSandboxBehaviors(getPropAsset(prop.type), behaviors, state, prop);
    };
    /** @param {object} prop */
    const getPropBehaviorId = (prop) => {
        const allowed = listSelectedBehaviors(prop);
        if (allowed.length === 0) return spawnBehaviorId;
        return clampBehaviorId(entityMeta().getActiveBehaviorId(prop.id) ?? spawnBehaviorId, allowed);
    };
    /** @param {object | null | undefined} prop */
    const stampPropBehavior = (prop) => {
        if (!prop) return;
        const allowed = listSelectedBehaviors(prop);
        if (allowed.length === 0) return;
        entityMeta().setActiveBehaviorId(prop.id, clampBehaviorId(spawnBehaviorId, allowed));
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
        groundNav = null;
    };
    /** @returns {{ prop: object, behavior: SandboxBehavior } | null} */
    const resolveGroundMove = () => {
        const prop = session.getSelectedProp();
        const behavior = resolveBehavior();
        if (!prop || !behavior?.setGroundMoveTarget) return null;
        return { prop, behavior };
    };
    /** @param {{ prop: object, behavior: SandboxBehavior }} move @param {{ x: number, y: number }} world */
    const issueGroundMove = (move, world) => {
        move.behavior.setGroundMoveTarget(move.prop, world);
    };
    /** @param {{ x: number, y: number }} world @param {PointerEvent} e */
    const tryCanvasInput = (world, e) => {
        for (let i = 0; i < behaviors.length; i++) if (behaviors[i].tryCanvasInput?.(world, e)) return true;
        return false;
    };
    /** @param {PointerEvent} e */
    const onPointerDown = (e) => {
        const canvas = getCanvas();
        const world = clientToWorld(e.clientX, e.clientY);
        const registry = state.entityRegistry;
        if (e.button === 2) {
            const hit = findWorldPropAtInView(registry, combatSpatial, world.x, world.y);
            if (hit) {
                e.preventDefault();
                e.stopPropagation();
                session.deleteProp(hit);
                return;
            }
            const groundMove = resolveGroundMove();
            if (groundMove) {
                issueGroundMove(groundMove, world);
                e.preventDefault();
                e.stopPropagation();
                session.sync();
            }
            return;
        }
        if (e.button !== 0) return;
        if (padWireMode) {
            const buttonPadId = session.getSelectedPadId();
            const buttonPad = buttonPadId ? state.entityRegistry.get(buttonPadId) : null;
            if (buttonPad?.preset === "button") {
                const target = findButtonLinkTarget(state, world.x, world.y, buttonPad.id);
                if (target) addButtonPadLink(state, buttonPad.id, target);
                session.sync();
                e.preventDefault();
                e.stopPropagation();
                return;
            }
        }
        const pad = hitTestPad(state, world.x, world.y);
        if (pad && handlePadPointerDown(state, pad, world)) {
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
            const allowed = resolveSandboxBehaviors(getPropAsset(hit.type), behaviors, state, hit);
            if (allowed.length > 0) session.setSelectedPropId(hit.id);
            const prop = session.getSelectedProp();
            const behavior = resolveBehavior();
            if (prop && behavior?.onPointerDown(prop, world, e)) {
                e.preventDefault();
                e.stopPropagation();
                interactionBehavior = behavior;
                canvas.setPointerCapture(e.pointerId);
                session.sync();
            }
            return;
        }
        const groundMove = resolveGroundMove();
        if (groundMove) {
            issueGroundMove(groundMove, world);
            groundNav = { pointerId: e.pointerId, prop: groundMove.prop, behavior: groundMove.behavior };
            canvas.setPointerCapture(e.pointerId);
            e.preventDefault();
            e.stopPropagation();
            session.sync();
            return;
        }
        marqueeSelect = { pointerId: e.pointerId, startClientX: e.clientX, startClientY: e.clientY, startWorld: world, currentWorld: world };
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
        e.stopPropagation();
    };
    /** @param {PointerEvent} e */
    const onPointerMove = (e) => {
        if (padWireMode) {
            padWireCursor = clientToWorld(e.clientX, e.clientY);
            requestRedraw();
        }
        if (marqueeSelect) {
            marqueeSelect.currentWorld = clientToWorld(e.clientX, e.clientY);
            requestRedraw();
            return;
        }
        if (groundNav) {
            const world = clientToWorld(e.clientX, e.clientY);
            groundNav.behavior.updateGroundMoveTarget?.(groundNav.prop, world);
            requestRedraw();
            return;
        }
        if (!interactionBehavior) return;
        const prop = session.getSelectedProp();
        if (!prop) return;
        const world = clientToWorld(e.clientX, e.clientY);
        e.stopPropagation();
        interactionBehavior.onPointerMove(prop, world, e);
    };
    /** @param {PointerEvent} e */
    const onPointerUp = (e) => {
        releaseButtonPointerHold(state);
        const canvas = getCanvas();
        if (groundNav) {
            const nav = groundNav;
            groundNav = null;
            releasePointerCapture(canvas, e);
            const world = clientToWorld(e.clientX, e.clientY);
            nav.behavior.updateGroundMoveTarget?.(nav.prop, world);
            e.preventDefault();
            e.stopPropagation();
            session.sync();
            return;
        }
        if (marqueeSelect) {
            const drag = marqueeSelect;
            marqueeSelect = null;
            releasePointerCapture(canvas, e);
            const dragPx = Math.hypot(e.clientX - drag.startClientX, e.clientY - drag.startClientY);
            if (dragPx < MARQUEE_CLICK_THRESHOLD_PX) {
                session.clearPropSelection();
                session.setSelectedPadId(null);
            } else {
                const endWorld = clientToWorld(e.clientX, e.clientY);
                const props = findSandboxPropsInWorldRect(state, state.entityRegistry, aabbFromTwoPointsInto(MARQUEE_BOUNDS, drag.startWorld.x, drag.startWorld.y, endWorld.x, endWorld.y));
                session.setSelectedPropIds(props.map((prop) => prop.id));
            }
            e.preventDefault();
            e.stopPropagation();
            session.sync();
            return;
        }
        if (!interactionBehavior) return;
        const prop = session.getSelectedProp();
        if (prop) {
            const world = clientToWorld(e.clientX, e.clientY);
            interactionBehavior.onPointerMove(prop, world, e);
            interactionBehavior.onPointerUp(prop, e);
        }
        interactionBehavior = null;
        releasePointerCapture(canvas, e);
        e.stopPropagation();
        session.sync();
    };
    /** @returns {{ selectedProps: object[], marqueeRect: import("../Math/Aabb2D.js").Aabb2D | null }} */
    const selectionDrawState = () => {
        const selectedIds = session.getSelectedPropIds();
        /** @type {object[]} */
        const selectedProps = [];
        for (let i = 0; i < selectedIds.length; i++) {
            const prop = state.entityRegistry.getLive(selectedIds[i]);
            if (prop) selectedProps.push(prop);
        }
        const marqueeRect = marqueeSelect
            ? aabbFromTwoPointsInto(MARQUEE_BOUNDS, marqueeSelect.startWorld.x, marqueeSelect.startWorld.y, marqueeSelect.currentWorld.x, marqueeSelect.currentWorld.y)
            : null;
        return { selectedProps, marqueeRect };
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
        getSelectedPropIds: () => session.getSelectedPropIds(),
        getSelectedProp: () => session.getSelectedProp(),
        setSelectedPropIds: (ids) => {
            padWireMode = false;
            padWireCursor = null;
            session.setSelectedPropIds(ids);
        },
        clearPropSelection: () => {
            padWireMode = false;
            padWireCursor = null;
            session.clearPropSelection();
        },
        getShowSelectionRings: () => showSelectionRings,
        setShowSelectionRings: (enabled) => {
            showSelectionRings = enabled;
            session.sync();
        },
        deleteSelectedProps: () => session.deleteSelectedProps(),
        setSelectedPropId: (id) => {
            padWireMode = false;
            padWireCursor = null;
            session.setSelectedPropId(id);
            const prop = session.getSelectedProp();
            if (prop && entityMeta().getActiveBehaviorId(prop.id) == null) {
                const allowed = listSelectedBehaviors(prop);
                if (allowed.length > 0) entityMeta().setActiveBehaviorId(prop.id, allowed[0]);
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
            padWireCursor = { x: state.viewport.x, y: state.viewport.y };
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
            clearButtonPadLinks(state, padId);
            session.sync();
        },
        removeSelectedPadLink: (target) => {
            const padId = session.getSelectedPadId();
            if (!padId) return;
            removeButtonPadLink(state, padId, target);
            session.sync();
        },
        listSelectedPadLinks: () => {
            const padId = session.getSelectedPadId();
            if (!padId) return [];
            const pad = state.entityRegistry.get(padId);
            if (!pad) return [];
            return listButtonPadLinkEndpoints(state, pad);
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
            entityMeta().setActiveBehaviorId(prop.id, clampBehaviorId(id, listSelectedBehaviors(prop)));
            session.sync();
        },
        listSelectedBehaviors: () => listSelectedBehaviors(),
        register() {
            controller.destroy();
            unbindPointers = bindCanvasPointers(getCanvas(), { pointerdown: onPointerDown, pointermove: onPointerMove, pointerup: onPointerUp, pointercancel: onPointerUp });
        },
        destroy() {
            unbindPointers?.();
            unbindPointers = null;
            padWireMode = false;
            padWireCursor = null;
            marqueeSelect = null;
            groundNav = null;
            resetBehaviors();
            session.setUiSync(null);
        },
        clearBodies() {
            session.clear();
            resetBehaviors();
        },
        tick(dt) {
            session.pruneSelection();
            for (let i = 0; i < behaviors.length; i++) behaviors[i].tickWorld?.(dt);
            const prop = session.getSelectedProp();
            const behavior = resolveBehavior();
            if (!prop || !behavior?.tick) return;
            behavior.tick(prop, dt);
        },
        /** @param {CanvasRenderingContext2D} ctx */
        drawPathOverlay(ctx) {
            const prop = session.getSelectedProp();
            const behavior = resolveBehavior();
            if (!prop) return;
            const visual = resolveSandboxPathVisual(state, prop);
            if (visual === "off" || !behavior?.getPathOverlay) return;
            const overlay = behavior.getPathOverlay(prop);
            if (!overlay) return;
            drawActivePathOverlay(ctx, overlay, state.viewport.zoom, visual);
        },
        drawLaunchPreview(ctx) {
            const prop = session.getSelectedProp();
            const behavior = resolveBehavior();
            behavior?.drawOverlay?.(ctx, prop);
        },
        drawBehaviorOverlays(ctx) {
            drawSandboxPadWires(ctx, state, { wireFromPadId: padWireMode ? session.getSelectedPadId() : null, wireCursor: padWireMode ? padWireCursor : null });
            for (let i = 0; i < behaviors.length; i++) behaviors[i].drawWorldOverlay?.(ctx);
        },
        drawSelectionRings(ctx) {
            const { selectedProps } = selectionDrawState();
            drawSandboxSelectionRings(ctx, { selectedProps, showRings: showSelectionRings });
        },
        drawMarqueeOverlay(ctx) {
            const { marqueeRect } = selectionDrawState();
            drawSandboxMarquee(ctx, { marqueeRect });
        },
        drawOverlay(ctx) {
            drawSandboxWeaponBars(ctx, state);
            drawSandboxLaserSights(ctx, state);
        },
        getPathVisual(prop = session.getSelectedProp()) {
            return prop ? resolveSandboxPathVisual(state, prop) : "off";
        },
        setPathVisual(visual, prop = session.getSelectedProp()) {
            if (!prop) return;
            setSandboxPathVisual(state, prop, visual);
            session.sync();
        },
        isCameraTarget(prop = session.getSelectedProp()) {
            return prop ? isSandboxCameraTarget(state, prop) : false;
        },
        setCameraTarget(enabled, prop = session.getSelectedProp()) {
            if (!prop) return;
            setSandboxCameraTarget(state, prop, enabled);
            if (enabled) state.viewport.snapTo(prop.x, prop.y);
            session.sync();
        },
    };
    return controller;
}
