import { drawForcefieldEdges } from "./drawForcefields.js";
import { getPropAsset } from "../Props/PropCatalog.js";
import { bindCanvasPointers, releasePointerCapture } from "./bindCanvasPointers.js";
import { findWorldPropAtInView } from "../../GameState/EntityRegistry.js";
import { combatSpatial } from "../../Systems/World/CombatSpatialFrame.js";
import { createSandboxSession } from "./sandboxSession.js";
import { clearFloorOverlayAt } from "./floorOccupancy.js";
import { addButtonLink, clearButtonLinks, drawButtonWires, findButtonLinkTarget, listButtonLinkEndpoints, removeButtonLink } from "./buttonLinks.js";
import { isButtonEntity } from "./buttonInput.js";
import { handleButtonPointerDown, hitTestFloorButton, releaseButtonPointerHold } from "./floorButtons.js";
import { ensureBoundaryNavHops } from "./boundaryNavSync.js";
import { recomputePassagePowerNetwork } from "./passagePowerNetwork.js";
import { resolveSandboxBehaviors } from "./sandboxCapabilities.js";
import { ROLL_TO_CURSOR_HPA_BEHAVIOR_ID } from "./behaviors/rollToCursorHpaBehavior.js";
import { applySandboxSceneSnapshot, collectSandboxSceneSnapshot, parseSandboxSceneSnapshot } from "./sandboxSceneSnapshot.js";
import { spawnSandboxStartScene } from "./sandboxStartScene.js";
import { drawSandboxLaserSights } from "./drawLaserSights.js";
import { drawSandboxMarquee, drawSandboxPropTileCells, drawSandboxSelectionRings, findSandboxPropsInWorldRect } from "./drawSandboxSelection.js";
import { drawSandboxPlacePreview, resolveSandboxPlacePreview } from "./drawSandboxPlacePreview.js";
import { drawPlacedRoomNodes, pickRoomNodeAt } from "../RoomGraph/index.js";
import { aabbFromTwoPointsInto, createAabb } from "../Math/Aabb2D.js";
import { drawActivePathOverlay } from "../Render/map/drawActivePathOverlay.js";
import { drawSandboxWeaponBars } from "./drawWorldPropWeaponBars.js";
import { resolveSandboxPathVisual, setSandboxPathVisual } from "./sandboxPathVisual.js";
import { resolveSandboxPropVisual, setSandboxPropVisual } from "./sandboxPropVisual.js";
import { isSandboxCameraTarget, setSandboxCameraTarget } from "./sandboxCameraTarget.js";
import { getSandboxEntityMeta } from "./sandboxEntityMeta.js";
import { registerSandboxPassageHandlers } from "./portalTraverse.js";
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
 *   getCanvas: () => HTMLCanvasElement,
 *   clientToWorld: (clientX: number, clientY: number) => { x: number, y: number },
 *   defaultSpawnPropId: string,
 *   behaviors: SandboxBehavior[],
 *   defaultBehaviorId?: string,
 * }} options
 */
export function createSandboxController(state, { getCanvas, clientToWorld, defaultSpawnPropId, behaviors, defaultBehaviorId }) {
    registerSandboxPassageHandlers();
    state.obstacleGrid.setBoundaryNavHopEnsurer(() => ensureBoundaryNavHops(state));
    state.obstacleGrid._recomputePassagePowerForNav = () => recomputePassagePowerNetwork(state);
    const session = createSandboxSession(state, { defaultSpawnPropId });
    const behaviorById = new Map(behaviors.map((behavior) => [behavior.id, behavior]));
    let spawnBehaviorId = defaultBehaviorId ?? behaviors[0]?.id ?? "";
    /** @type {SandboxBehavior | null} */
    let interactionBehavior = null;
    /** @type {(() => void) | null} */
    let unbindPointers = null;
    /** @type {(() => void) | null} */
    let unbindKeyDown = null;
    /** @type {(() => void) | null} */
    let unbindKeyUp = null;
    let pKeyHeld = false;
    let buttonWireMode = false;
    /** @type {{ x: number, y: number } | null} */
    let buttonWireCursor = null;
    let roomNodeWireMode = false;
    /** @type {{ x: number, y: number } | null} */
    let roomNodeWireCursor = null;
    let showSelectionRings = true;
    let showPropTileCells = false;
    let showRoomNodesAlways = false;
    const MARQUEE_CLICK_THRESHOLD_PX = 4;
    /** @type {{ pointerId: number, startClientX: number, startClientY: number, startWorld: { x: number, y: number }, currentWorld: { x: number, y: number } } | null} */
    let marqueeSelect = null;
    /** @type {{ pointerId: number, prop: object, behavior: SandboxBehavior } | null} */
    let groundNav = null;
    /** @type {{ x: number, y: number } | null} */
    let placePreviewWorld = null;
    const entityMeta = () => getSandboxEntityMeta(state);
    const spawnAsset = () => getPropAsset(session.getSpawnPropId());
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
    /** @param {{ x: number, y: number }} world */
    const issueMassHpaGroundMove = (world) => {
        if (session.isWallPlaceMode() || session.isMapGenPlaceMode() || buttonWireMode || roomNodeWireMode) return false;
        const hpaBehavior = behaviorById.get(ROLL_TO_CURSOR_HPA_BEHAVIOR_ID);
        if (!hpaBehavior?.setGroundMoveTarget) return false;
        let moved = 0;
        state.entityRegistry.forEachOfKind("worldProp", (prop) => {
            if (prop.isDead) return;
            const allowed = resolveSandboxBehaviors(getPropAsset(prop.type), behaviors, state, prop);
            if (!allowed.includes(ROLL_TO_CURSOR_HPA_BEHAVIOR_ID)) return;
            if (getPropBehaviorId(prop) !== ROLL_TO_CURSOR_HPA_BEHAVIOR_ID) return;
            hpaBehavior.setGroundMoveTarget(prop, world);
            moved++;
        });
        return moved > 0;
    };
    /** @param {{ x: number, y: number }} world @param {PointerEvent} e */
    const tryCanvasInput = (world, e) => {
        for (let i = 0; i < behaviors.length; i++) if (behaviors[i].tryCanvasInput?.(world, e)) return true;
        return false;
    };
    /** @param {{ x: number, y: number }} world @param {PointerEvent} e @returns {boolean} */
    const tryPlaceSpawnAtWorld = (world, e) => {
        if (session.isWallPlaceMode() || session.isMapGenPlaceMode() || buttonWireMode || roomNodeWireMode) return false;
        if (!session.spawnAt(world.x, world.y)) return false;
        stampPropBehavior(session.getSelectedProp());
        e.preventDefault();
        e.stopPropagation();
        return true;
    };
    /** @param {{ x: number, y: number }} world @param {PointerEvent} e */
    const tryPickPlacedAtWorld = (world, e) => {
        const registry = state.entityRegistry;
        const hit = findWorldPropAtInView(registry, combatSpatial, world.x, world.y);
        if (hit) {
            const allowed = resolveSandboxBehaviors(getPropAsset(hit.type), behaviors, state, hit);
            if (allowed.length === 0) return false;
            buttonWireMode = false;
            buttonWireCursor = null;
            roomNodeWireMode = false;
            roomNodeWireCursor = null;
            session.setPlacePaletteKey(`prop:${hit.type}`);
            session.setSelectedPropId(hit.id);
            const prop = session.getSelectedProp();
            if (prop && entityMeta().getActiveBehaviorId(prop.id) == null) {
                const propBehaviors = listSelectedBehaviors(prop);
                if (propBehaviors.length > 0) entityMeta().setActiveBehaviorId(prop.id, propBehaviors[0]);
            }
            e.preventDefault();
            e.stopPropagation();
            return true;
        }
        const grid = state.obstacleGrid;
        const { col, row } = grid.worldToGrid(world.x, world.y);
        if (session.pickRoomNodeAtWorld(world.x, world.y)) {
            e.preventDefault();
            e.stopPropagation();
            return true;
        }
        if (grid.hasFloorOccupancy(col, row)) {
            session.setSelectedFloorCell(col, row);
            e.preventDefault();
            e.stopPropagation();
            return true;
        }
        if (!session.pickAnyWallAtWorld(world.x, world.y)) return false;
        e.preventDefault();
        e.stopPropagation();
        return true;
    };
    /** @param {{ x: number, y: number }} world @param {PointerEvent} e */
    const handleWallPointerDown = (world, e) => {
        if (e.button === 2) {
            session.deleteWallAtWorld(world.x, world.y);
            e.preventDefault();
            e.stopPropagation();
            return true;
        }
        if (e.button !== 0) return false;
        if (session.pickWallAtWorld(world.x, world.y)) {
            e.preventDefault();
            e.stopPropagation();
            return true;
        }
        session.stampWallAtWorld(world.x, world.y);
        e.preventDefault();
        e.stopPropagation();
        return true;
    };
    /** @param {PointerEvent} e */
    const onPointerDown = (e) => {
        const canvas = getCanvas();
        const world = clientToWorld(e.clientX, e.clientY);
        if (e.button === 0 && (e.ctrlKey || e.metaKey) && tryPlaceSpawnAtWorld(world, e)) return;
        if (e.button === 0 && e.shiftKey && tryPickPlacedAtWorld(world, e)) return;
        if (session.isWallPlaceMode()) {
            handleWallPointerDown(world, e);
            return;
        }
        const registry = state.entityRegistry;
        if (e.button === 2) {
            const hit = findWorldPropAtInView(registry, combatSpatial, world.x, world.y);
            if (hit) {
                e.preventDefault();
                e.stopPropagation();
                session.deleteProp(hit);
                return;
            }
            const grid = state.obstacleGrid;
            const { col, row } = grid.worldToGrid(world.x, world.y);
            const roomNode = pickRoomNodeAt(state, col, row);
            if (roomNode) {
                session.setSelectedRoomNodeId(roomNode.id);
                session.deleteSelectedRoomNode();
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            if (clearFloorOverlayAt(state, col, row)) {
                const selectedFloor = session.getSelectedFloorCell();
                if (selectedFloor?.col === col && selectedFloor.row === row) session.clearFloorSelection();
                e.preventDefault();
                e.stopPropagation();
                session.sync();
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
        if (pKeyHeld && issueMassHpaGroundMove(world)) {
            e.preventDefault();
            e.stopPropagation();
            session.sync();
            return;
        }
        if (buttonWireMode) {
            const button = session.getSelectedProp();
            if (isButtonEntity(button)) {
                const target = findButtonLinkTarget(state, world.x, world.y, button.id);
                if (target) addButtonLink(state, button.id, target);
                session.sync();
                e.preventDefault();
                e.stopPropagation();
                return;
            }
        }
        if (roomNodeWireMode) {
            const fromNode = session.getSelectedRoomNode();
            if (fromNode) {
                const grid = state.obstacleGrid;
                const { col, row } = grid.worldToGrid(world.x, world.y);
                const target = pickRoomNodeAt(state, col, row);
                if (target && target.id !== fromNode.id) {
                    if (session.addRoomLinkBetweenNodes(fromNode.id, target.id)) {
                        roomNodeWireMode = false;
                        roomNodeWireCursor = null;
                    }
                } else session.sync();
                e.preventDefault();
                e.stopPropagation();
                return;
            }
        }
        const floorButton = hitTestFloorButton(state, world.x, world.y);
        if (floorButton && handleButtonPointerDown(state, floorButton, world)) {
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
        const grid = state.obstacleGrid;
        const { col, row } = grid.worldToGrid(world.x, world.y);
        if (session.pickRoomNodeAtWorld(world.x, world.y)) {
            buttonWireMode = false;
            buttonWireCursor = null;
            if (!roomNodeWireMode) {
                roomNodeWireMode = false;
                roomNodeWireCursor = null;
            }
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        if (grid.hasFloorOccupancy(col, row)) {
            session.setSelectedFloorCell(col, row);
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        if (session.pickForcefieldAtWorld(world.x, world.y)) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        marqueeSelect = { pointerId: e.pointerId, startClientX: e.clientX, startClientY: e.clientY, startWorld: world, currentWorld: world };
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
        e.stopPropagation();
    };
    /** @param {PointerEvent} e */
    const onPointerMove = (e) => {
        if (buttonWireMode) buttonWireCursor = clientToWorld(e.clientX, e.clientY);
        if (roomNodeWireMode) roomNodeWireCursor = clientToWorld(e.clientX, e.clientY);
        if (!interactionBehavior && !marqueeSelect && !groundNav && !buttonWireMode && !roomNodeWireMode && !session.isMapGenPlaceMode()) placePreviewWorld = clientToWorld(e.clientX, e.clientY);
        if (marqueeSelect) {
            marqueeSelect.currentWorld = clientToWorld(e.clientX, e.clientY);
            return;
        }
        if (groundNav) {
            groundNav.behavior.updateGroundMoveTarget?.(groundNav.prop, clientToWorld(e.clientX, e.clientY));
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
    const onPointerLeave = () => {
        placePreviewWorld = null;
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
                const world = clientToWorld(e.clientX, e.clientY);
                if (!e.shiftKey && !session.isWallPlaceMode() && !session.isMapGenPlaceMode() && session.spawnAt(world.x, world.y)) stampPropBehavior(session.getSelectedProp());
                else {
                    session.clearPropSelection();
                    session.clearFloorSelection();
                }
            } else {
                const endWorld = clientToWorld(e.clientX, e.clientY);
                const props = findSandboxPropsInWorldRect(state, state.entityRegistry, aabbFromTwoPointsInto(MARQUEE_BOUNDS, drag.startWorld.x, drag.startWorld.y, endWorld.x, endWorld.y));
                session.setSelectedPropIds(props.map((prop) => prop.id));
            }
            e.preventDefault();
            e.stopPropagation();
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
        getSpawnRoomNodeCols: () => session.getSpawnRoomNodeCols(),
        setSpawnRoomNodeCols: (cols) => session.setSpawnRoomNodeCols(cols),
        getSpawnRoomNodeRows: () => session.getSpawnRoomNodeRows(),
        setSpawnRoomNodeRows: (rows) => session.setSpawnRoomNodeRows(rows),
        getSelectedPropId: () => session.getSelectedPropId(),
        getSelectedPropIds: () => session.getSelectedPropIds(),
        getSelectedProp: () => session.getSelectedProp(),
        setSelectedPropIds: (ids) => {
            buttonWireMode = false;
            buttonWireCursor = null;
            roomNodeWireMode = false;
            roomNodeWireCursor = null;
            session.setSelectedPropIds(ids);
        },
        clearPropSelection: () => {
            buttonWireMode = false;
            buttonWireCursor = null;
            roomNodeWireMode = false;
            roomNodeWireCursor = null;
            session.clearPropSelection();
        },
        getShowSelectionRings: () => showSelectionRings,
        setShowSelectionRings: (enabled) => {
            showSelectionRings = enabled;
        },
        getShowPropTileCells: () => showPropTileCells,
        setShowPropTileCells: (enabled) => {
            showPropTileCells = enabled;
        },
        getShowRoomNodesAlways: () => showRoomNodesAlways,
        setShowRoomNodesAlways: (enabled) => {
            showRoomNodesAlways = enabled;
        },
        deleteSelectedProps: () => session.deleteSelectedProps(),
        setSelectedPropId: (id) => {
            buttonWireMode = false;
            buttonWireCursor = null;
            roomNodeWireMode = false;
            roomNodeWireCursor = null;
            session.setSelectedPropId(id);
            const prop = session.getSelectedProp();
            if (prop && entityMeta().getActiveBehaviorId(prop.id) == null) {
                const allowed = listSelectedBehaviors(prop);
                if (allowed.length > 0) entityMeta().setActiveBehaviorId(prop.id, allowed[0]);
            }
        },
        startButtonWireLink: () => {
            if (!isButtonEntity(session.getSelectedProp())) return;
            roomNodeWireMode = false;
            roomNodeWireCursor = null;
            buttonWireMode = true;
            buttonWireCursor = { x: state.viewport.x, y: state.viewport.y };
            session.sync();
        },
        cancelButtonWireLink: () => {
            buttonWireMode = false;
            buttonWireCursor = null;
            session.sync();
        },
        isButtonWireLinkActive: () => buttonWireMode,
        startRoomNodeWireLink: () => {
            if (!session.getSelectedRoomNode()) return;
            buttonWireMode = false;
            buttonWireCursor = null;
            roomNodeWireMode = true;
            roomNodeWireCursor = { x: state.viewport.x, y: state.viewport.y };
            session.sync();
        },
        cancelRoomNodeWireLink: () => {
            roomNodeWireMode = false;
            roomNodeWireCursor = null;
            session.sync();
        },
        isRoomNodeWireLinkActive: () => roomNodeWireMode,
        getSelectedRoomNodeInfo: () => session.getSelectedRoomNodeInfo(),
        getSelectedRoomLinkInfo: () => session.getSelectedRoomLinkInfo(),
        getSelectedRoomLinkId: () => session.getSelectedRoomLinkId(),
        getSelectedRoomLinkCorridorIndex: () => session.getSelectedRoomLinkCorridorIndex(),
        setSelectedRoomLinkId: (linkId, corridorIndex) => session.setSelectedRoomLinkId(linkId, corridorIndex),
        deleteSelectedRoomNode: () => session.deleteSelectedRoomNode(),
        deleteSelectedRoomLink: () => session.deleteSelectedRoomLink(),
        updateSelectedRoomLink: (patch) => session.updateSelectedRoomLink(patch),
        rerollSelectedRoomLink: () => session.rerollSelectedRoomLink(),
        listSelectedRoomNodeLinks: () => session.listSelectedRoomNodeLinks(),
        removeRoomLinkById: (linkId) => session.removeRoomLinkById(linkId),
        clearSelectedRoomNodeLinks: () => session.clearSelectedRoomNodeLinks(),
        clearSelectedButtonLinks: () => {
            const button = session.getSelectedProp();
            if (!isButtonEntity(button)) return;
            clearButtonLinks(state, button.id);
            session.sync();
        },
        removeSelectedButtonLink: (target) => {
            const button = session.getSelectedProp();
            if (!isButtonEntity(button)) return;
            removeButtonLink(state, button.id, target);
            session.sync();
        },
        listSelectedButtonLinks: () => {
            const button = session.getSelectedProp();
            if (!isButtonEntity(button)) return [];
            return listButtonLinkEndpoints(state, button);
        },
        spawnAtCameraOrigin: () => {
            session.spawnAtCameraOrigin();
            stampPropBehavior(session.getSelectedProp());
        },
        deletePropById: (id) => session.deletePropById(id),
        listPlacedProps: () => session.listPlacedProps(),
        listPlacedFloorBelts: () => session.listPlacedFloorBelts(),
        stampPassagePowerSourceAtWorld: (worldX, worldY, defaultPowered) => session.stampPassagePowerSourceAtWorld(worldX, worldY, defaultPowered),
        listPlacedPassagePowerSources: () => session.listPlacedPassagePowerSources(),
        getSelectedFloorCell: () => session.getSelectedFloorCell(),
        setSelectedFloorCell: (col, row) => session.setSelectedFloorCell(col, row),
        clearFloorSelection: () => session.clearFloorSelection(),
        rotateSelectedFloorBelt: (steps) => session.rotateSelectedFloorBelt(steps),
        moveSelectedFloorBeltTo: (col, row) => session.moveSelectedFloorBeltTo(col, row),
        setSelectedFloorBeltKind: (kind) => session.setSelectedFloorBeltKind(kind),
        deleteSelectedFloorCell: () => session.deleteSelectedFloorCell(),
        getSelectedFloorBeltInfo: () => session.getSelectedFloorBeltInfo(),
        getSelectedPassagePowerSourceInfo: () => session.getSelectedPassagePowerSourceInfo(),
        setSelectedPassagePowerSourceDefaultPowered: (powered) => session.setSelectedPassagePowerSourceDefaultPowered(powered),
        getPlacePaletteKey: () => session.getPlacePaletteKey(),
        setPlacePaletteKey: (key) => session.setPlacePaletteKey(key),
        isWallPlaceMode: () => session.isWallPlaceMode(),
        isMapGenPlaceMode: () => session.isMapGenPlaceMode(),
        getWallStampMode: () => session.getWallStampMode(),
        setWallStampMode: (mode) => session.setWallStampMode(mode),
        getWallHeightLevel: () => session.getWallHeightLevel(),
        setWallHeightLevel: (level) => session.setWallHeightLevel(level),
        getRailThicknessLevel: () => session.getRailThicknessLevel(),
        setRailThicknessLevel: (level) => session.setRailThicknessLevel(level),
        getSelectedVoxelCell: () => session.getSelectedVoxelCell(),
        getSelectedRailEdge: () => session.getSelectedRailEdge(),
        setSelectedVoxelCell: (col, row) => session.setSelectedVoxelCell(col, row),
        setSelectedRailEdge: (col, row, side) => session.setSelectedRailEdge(col, row, side),
        clearWallSelection: () => session.clearWallSelection(),
        listPlacedVoxelWalls: () => session.listPlacedVoxelWalls(),
        listPlacedRailWalls: () => session.listPlacedRailWalls(),
        listPlacedForcefields: () => session.listPlacedForcefields(),
        listPlacedPortals: () => session.listPlacedPortals(),
        listPlacedSceneItems: () => session.listPlacedSceneItems(),
        isSceneItemSelected: (item) => session.isSceneItemSelected(item),
        selectSceneItem: (item) => {
            buttonWireMode = false;
            buttonWireCursor = null;
            roomNodeWireMode = false;
            roomNodeWireCursor = null;
            session.selectSceneItem(item);
        },
        deleteSceneItem: (item) => session.deleteSceneItem(item),
        seedPlacementOrderFromState: () => session.seedPlacementOrderFromState(),
        listPortalLinkTargets: () => session.listPortalLinkTargets(),
        getSelectedVoxelWallInfo: () => session.getSelectedVoxelWallInfo(),
        getSelectedRailWallInfo: () => session.getSelectedRailWallInfo(),
        getSelectedForcefieldInfo: () => session.getSelectedForcefieldInfo(),
        getSelectedPortalInfo: () => session.getSelectedPortalInfo(),
        getForcefieldStampMode: () => session.getForcefieldStampMode(),
        setForcefieldStampMode: (mode) => session.setForcefieldStampMode(mode),
        getPortalStampMouthNeighbor: () => session.getPortalStampMouthNeighbor(),
        setPortalStampMouthNeighbor: (neighbor) => session.setPortalStampMouthNeighbor(neighbor),
        setSelectedForcefieldMode: (mode) => session.setSelectedForcefieldMode(mode),
        setSelectedForcefieldAllowedSide: (side) => session.setSelectedForcefieldAllowedSide(side),
        setSelectedPortalMouthSide: (side) => session.setSelectedPortalMouthSide(side),
        linkSelectedPortalTo: (col, row, side) => session.linkSelectedPortalTo(col, row, side),
        unlinkSelectedPortal: () => session.unlinkSelectedPortal(),
        setSelectedPortalConnection: (connection) => session.setSelectedPortalConnection(connection),
        stampWallAtCameraOrigin: () => session.stampWallAtCameraOrigin(),
        setSelectedVoxelWallHeight: (heightLevel) => session.setSelectedVoxelWallHeight(heightLevel),
        setSelectedRailWallProps: (heightLevel, thicknessLevel) => session.setSelectedRailWallProps(heightLevel, thicknessLevel),
        setSelectedRailWallSide: (side) => session.setSelectedRailWallSide(side),
        deleteSelectedWall: () => session.deleteSelectedWall(),
        exportSceneSnapshot: () => JSON.stringify(collectSandboxSceneSnapshot(state), null, 2),
        importSceneSnapshot(json) {
            applySandboxSceneSnapshot(state, parseSandboxSceneSnapshot(json));
            resetBehaviors();
            session.clearPropSelection();
            session.clearFloorSelection();
            session.clearWallSelection();
            session.seedPlacementOrderFromState();
            session.sync();
        },
        loadStartScene() {
            spawnSandboxStartScene(state);
            resetBehaviors();
            session.clearPropSelection();
            session.clearFloorSelection();
            session.clearWallSelection();
            session.seedPlacementOrderFromState();
            session.sync();
        },
        sync: session.sync,
        getState: () => session.getState(),
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
            unbindPointers = bindCanvasPointers(getCanvas(), {
                pointerdown: onPointerDown,
                pointermove: onPointerMove,
                pointerup: onPointerUp,
                pointercancel: onPointerUp,
                pointerleave: onPointerLeave,
            });
            const onKeyDown = (e) => {
                if (e.target instanceof HTMLElement && (e.target.isContentEditable || e.target.matches("textarea, select, input"))) return;
                if (e.code === "KeyP") {
                    pKeyHeld = true;
                    return;
                }
                if (e.code !== "KeyR") return;
                if (!placePreviewWorld || interactionBehavior || marqueeSelect || groundNav || buttonWireMode || roomNodeWireMode) return;
                if (session.rotateHoveredGridOccupantAtWorld(placePreviewWorld.x, placePreviewWorld.y)) e.preventDefault();
            };
            const onKeyUp = (e) => {
                if (e.code === "KeyP") pKeyHeld = false;
            };
            window.addEventListener("keydown", onKeyDown);
            window.addEventListener("keyup", onKeyUp);
            unbindKeyDown = () => window.removeEventListener("keydown", onKeyDown);
            unbindKeyUp = () => window.removeEventListener("keyup", onKeyUp);
        },
        destroy() {
            unbindKeyDown?.();
            unbindKeyDown = null;
            unbindKeyUp?.();
            unbindKeyUp = null;
            pKeyHeld = false;
            unbindPointers?.();
            unbindPointers = null;
            buttonWireMode = false;
            buttonWireCursor = null;
            roomNodeWireMode = false;
            roomNodeWireCursor = null;
            marqueeSelect = null;
            groundNav = null;
            placePreviewWorld = null;
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
            if (behavior.tickWorld) return;
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
            drawActivePathOverlay(ctx, overlay, state.viewport.zoom, visual, state.obstacleGrid, state.viewport);
        },
        drawLaunchPreview(ctx) {
            const prop = session.getSelectedProp();
            const behavior = resolveBehavior();
            behavior?.drawOverlay?.(ctx, prop);
        },
        drawBehaviorOverlays(ctx) {
            drawPlacedRoomNodes(ctx, state, state.obstacleGrid, {
                selectedNodeId: session.getSelectedRoomNodeId(),
                selectedLinkId: session.getSelectedRoomLinkId(),
                wireFromNodeId: roomNodeWireMode ? session.getSelectedRoomNodeId() : null,
                wireCursor: roomNodeWireMode ? roomNodeWireCursor : null,
                showRoomNodesAlways,
                wireModeActive: roomNodeWireMode,
            });
            drawForcefieldEdges(ctx, state, state.viewport);
            drawButtonWires(ctx, state, { wireFromPropId: buttonWireMode ? session.getSelectedPropId() : null, wireCursor: buttonWireMode ? buttonWireCursor : null });
            for (let i = 0; i < behaviors.length; i++) behaviors[i].drawWorldOverlay?.(ctx);
        },
        drawSelectionRings(ctx) {
            const { selectedProps } = selectionDrawState();
            drawSandboxSelectionRings(ctx, {
                selectedProps,
                showRings: showSelectionRings,
                selectedFloorCell: session.getSelectedFloorCell(),
                selectedVoxelCell: session.getSelectedVoxelCell(),
                selectedRailEdge: session.getSelectedRailEdge(),
                grid: state.obstacleGrid,
                camera: { px: state.viewport.x, py: state.viewport.y },
            });
        },
        drawPropTileCells(ctx) {
            drawSandboxPropTileCells(ctx, { show: showPropTileCells, grid: state.obstacleGrid, worldProps: state.worldProps });
        },
        drawMarqueeOverlay(ctx) {
            const { marqueeRect } = selectionDrawState();
            drawSandboxMarquee(ctx, { marqueeRect });
        },
        drawPlacePreview(ctx) {
            if (!placePreviewWorld || interactionBehavior || marqueeSelect || groundNav || buttonWireMode || roomNodeWireMode || session.isMapGenPlaceMode()) return;
            const preview = resolveSandboxPlacePreview(state, session, placePreviewWorld.x, placePreviewWorld.y);
            drawSandboxPlacePreview(ctx, preview, state.obstacleGrid);
        },
        drawOverlay(ctx) {
            drawSandboxWeaponBars(ctx, state);
            drawSandboxLaserSights(ctx, state);
        },
        getPathVisual(prop) {
            return resolveSandboxPathVisual(state, prop);
        },
        setPathVisual(visual, prop) {
            setSandboxPathVisual(state, prop, visual);
            session.sync();
        },
        getPropVisual(prop) {
            return resolveSandboxPropVisual(state, prop);
        },
        setPropVisual(visual, prop) {
            setSandboxPropVisual(state, prop, visual);
            session.sync();
        },
        isCameraTarget(prop) {
            return isSandboxCameraTarget(state, prop);
        },
        setCameraTarget(enabled, prop) {
            setSandboxCameraTarget(state, prop, enabled);
            if (enabled) state.viewport.snapTo(prop.x, prop.y);
            session.sync();
        },
    };
    return controller;
}
