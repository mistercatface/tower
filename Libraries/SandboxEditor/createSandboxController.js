import { getPropAsset } from "../Props/PropCatalog.js";
import { bindCanvasPointers } from "../Input/canvasPointer.js";
import { createCanvasToolStack } from "../Editor/canvasToolStack.js";
import { createSandboxSession } from "../Sandbox/sandboxSession.js";
import { clearButtonLinks, drawButtonWires, listButtonLinkEndpoints, removeButtonLink } from "../Sandbox/buttonLinks.js";
import { isButtonEntity } from "../Sandbox/buttonInput.js";
import { createButtonWireTool } from "./buttonWireTool.js";
import { createCorridorLinkWireTool } from "./corridorLinkWireTool.js";
import { createSandboxMarqueeTool } from "./sandboxMarqueeTool.js";
import { createWallPlaceTool } from "./wallPlaceTool.js";
import { createSandboxDeletePointerTool } from "./sandboxDeletePointerTool.js";
import { createSandboxPointerGestures } from "./sandboxPointerGestures.js";
import { createSandboxPrimaryPointerTools } from "./sandboxPrimaryPointerTool.js";
import { releaseButtonPointerHold } from "../Sandbox/floorButtons.js";
import { applySandboxSceneSnapshot, collectSandboxSceneSnapshot, parseSandboxSceneSnapshot } from "../Sandbox/sandboxSceneSnapshot.js";
import { spawnSandboxStartScene } from "../Sandbox/sandboxStartScene.js";
import { drawSandboxLaserSights } from "../Sandbox/drawLaserSights.js";
import { drawSandboxPropTileCells, drawSandboxSelectionRings } from "../Sandbox/drawSandboxSelection.js";
import { drawSandboxPlacePreview, resolveSandboxPlacePreview } from "../Sandbox/drawSandboxPlacePreview.js";
import { drawPlacedRoomNodes } from "../RoomGraph/index.js";
import { resolveSandboxBehaviors, isRoomLinkSpawnAsset } from "../Sandbox/sandboxCapabilities.js";
import { createAabb } from "../Math/Aabb2D.js";
import { drawActivePathOverlay } from "../Render/map/drawActivePathOverlay.js";
import { drawSandboxWeaponBars } from "../Sandbox/drawWorldPropWeaponBars.js";
import { resolveSandboxPathVisual, resolveSandboxPropVisual, setSandboxPathVisual, setSandboxPropVisual } from "../Sandbox/sandboxPropMeta.js";
import { isSandboxCameraTarget, setSandboxCameraTarget } from "../Sandbox/sandboxCameraTarget.js";
import { getSandboxEntityMeta } from "../../GameState/sandboxEntityMeta.js";
/**
 * @param {object} state
 * @param {{
 *   getCanvas: () => HTMLCanvasElement,
 *   clientToWorld: (clientX: number, clientY: number) => { x: number, y: number },
 *   behaviors: import("../Sandbox/sandboxCapabilities.js").SandboxBehavior[],
 * }} options
 */
export function createSandboxController(state, { getCanvas, clientToWorld, behaviors }) {
    const session = createSandboxSession(state);
    const behaviorById = new Map(behaviors.map((behavior) => [behavior.id, behavior]));
    let spawnBehaviorId = behaviors[0]?.id ?? "";
    /** @type {(() => void) | null} */
    let unbindPointers = null;
    /** @type {(() => void) | null} */
    let unbindKeyDown = null;
    /** @type {(() => void) | null} */
    let unbindKeyUp = null;
    let pKeyHeld = false;
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
    const MARQUEE_AABB = createAabb();
    const gestures = createSandboxPointerGestures({ getCanvas, session, clientToWorld });
    const buttonWireTool = createButtonWireTool(state, session);
    const corridorLinkWireTool = createCorridorLinkWireTool(state, session);
    const wallPlaceTool = createWallPlaceTool(session);
    const blocksPlacement = () =>
        (buttonWireTool.isActive() && buttonWireTool.blocksPlacement()) ||
        (corridorLinkWireTool.isActive() && corridorLinkWireTool.blocksPlacement()) ||
        (wallPlaceTool.isActive() && wallPlaceTool.blocksPlacement());
    const exitWireModes = () => {
        buttonWireTool.exit();
        corridorLinkWireTool.exit();
    };
    const resolveBehavior = () => {
        const prop = session.getSelectedProp();
        if (!prop) return null;
        const allowed = listSelectedBehaviors(prop);
        const behavior = behaviorById.get(getPropBehaviorId(prop)) ?? null;
        if (!behavior || !allowed.includes(behavior.id)) return null;
        return behavior;
    };
    const resolveGroundMove = () => {
        const prop = session.getSelectedProp();
        const behavior = resolveBehavior();
        if (!prop || !behavior?.setGroundMoveTarget) return null;
        return { prop, behavior };
    };
    const issueGroundMove = (move, world) => {
        move.behavior.setGroundMoveTarget(move.prop, world);
    };
    const deletePointerTool = createSandboxDeletePointerTool(state, session, { resolveGroundMove, issueGroundMove });
    const { modifierTool, interactTool, gestureTool } = createSandboxPrimaryPointerTools(state, session, behaviors, {
        entityMeta,
        listSelectedBehaviors,
        getPropBehaviorId,
        stampPropBehavior,
        behaviorById,
        isPHeld: () => pKeyHeld,
        blocksPlacement,
        exitWireModes,
        exitButtonWire: () => buttonWireTool.exit(),
        resolveBehavior,
        resolveGroundMove,
        gestures,
    });
    const marqueeTool = createSandboxMarqueeTool(state, session, { getCanvas, aabbScratch: MARQUEE_AABB, stampPropBehavior });
    const canvasTools = createCanvasToolStack([modifierTool, wallPlaceTool, deletePointerTool, buttonWireTool, corridorLinkWireTool, interactTool, gestureTool, marqueeTool], { clientToWorld });
    const enterCorridorLinkWireMode = () => {
        buttonWireTool.exit();
        corridorLinkWireTool.enterLinkMode();
    };
    const resetBehaviors = () => {
        for (const behavior of behaviors) behavior.reset?.();
        gestures.reset();
    };
    /** @param {PointerEvent} e */
    const onPointerDown = (e) => {
        const world = clientToWorld(e.clientX, e.clientY);
        const down = canvasTools.dispatchPointerDown(world, e);
        if (down.handled) {
            if (down.preventDefault) {
                e.preventDefault();
                e.stopPropagation();
            }
            return;
        }
        if (canvasTools.tryBeginPointerDown(world, e)) {
            e.preventDefault();
            e.stopPropagation();
        }
    };
    /** @param {PointerEvent} e */
    const onPointerMove = (e) => {
        const world = clientToWorld(e.clientX, e.clientY);
        canvasTools.dispatchPointerMove(world, e);
        if (!canvasTools.capturesPointerMove() && !canvasTools.isDragging() && !canvasTools.blocksPlacePreview() && !session.isMapGenPlaceMode()) placePreviewWorld = world;
        if (canvasTools.isDragging()) return;
    };
    /** @param {PointerEvent} e */
    const onPointerLeave = () => {
        placePreviewWorld = null;
    };
    /** @param {PointerEvent} e */
    const onPointerUp = (e) => {
        releaseButtonPointerHold(state);
        const world = clientToWorld(e.clientX, e.clientY);
        if (canvasTools.dispatchPointerUp(world, e)) {
            e.preventDefault();
            e.stopPropagation();
        }
    };
    /** @returns {{ selectedProps: object[] }} */
    const selectionDrawState = () => {
        const selectedIds = session.getSelectedPropIds();
        /** @type {object[]} */
        const selectedProps = [];
        for (let i = 0; i < selectedIds.length; i++) {
            const prop = state.entityRegistry.getLive(selectedIds[i]);
            if (prop) selectedProps.push(prop);
        }
        return { selectedProps };
    };
    const controller = {
        getSpawnFaction: () => session.getSpawnFaction(),
        setSpawnFaction: (faction) => session.setSpawnFaction(faction),
        getSpawnRoomNodeCols: () => session.getSpawnRoomNodeCols(),
        setSpawnRoomNodeCols: (cols) => session.setSpawnRoomNodeCols(cols),
        getSpawnRoomNodeRows: () => session.getSpawnRoomNodeRows(),
        setSpawnRoomNodeRows: (rows) => session.setSpawnRoomNodeRows(rows),
        getSpawnPuzzleAreaCols: () => session.getSpawnPuzzleAreaCols(),
        setSpawnPuzzleAreaCols: (cols) => session.setSpawnPuzzleAreaCols(cols),
        getSpawnPuzzleAreaRows: () => session.getSpawnPuzzleAreaRows(),
        setSpawnPuzzleAreaRows: (rows) => session.setSpawnPuzzleAreaRows(rows),
        getSpawnCorridorType: () => session.getSpawnCorridorType(),
        setSpawnCorridorType: (type) => session.setSpawnCorridorType(type),
        getSpawnCorridorWidth: () => session.getSpawnCorridorWidth(),
        setSpawnCorridorWidth: (width) => session.setSpawnCorridorWidth(width),
        getSpawnRoomNodeSurfaceProfileId: () => session.getSpawnRoomNodeSurfaceProfileId(),
        setSpawnRoomNodeSurfaceProfileId: (profileId) => session.setSpawnRoomNodeSurfaceProfileId(profileId),
        getSpawnCorridorSurfaceProfileId: () => session.getSpawnCorridorSurfaceProfileId(),
        setSpawnCorridorSurfaceProfileId: (profileId) => session.setSpawnCorridorSurfaceProfileId(profileId),
        getSelectedPropId: () => session.getSelectedPropId(),
        getSelectedPropIds: () => session.getSelectedPropIds(),
        getSelectedProp: () => session.getSelectedProp(),
        setSelectedPropIds: (ids) => {
            exitWireModes();
            session.setSelectedPropIds(ids);
        },
        clearPropSelection: () => {
            exitWireModes();
            session.clearPropSelection();
        },
        deleteSelectedProps: () => session.deleteSelectedProps(),
        setSelectedPropId: (id) => {
            exitWireModes();
            session.setSelectedPropId(id);
            const prop = session.getSelectedProp();
            if (prop && entityMeta().getActiveBehaviorId(prop.id) == null) {
                const allowed = listSelectedBehaviors(prop);
                if (allowed.length > 0) entityMeta().setActiveBehaviorId(prop.id, allowed[0]);
            }
        },
        startButtonWireLink: () => {
            corridorLinkWireTool.exit();
            buttonWireTool.startLink();
        },
        cancelButtonWireLink: () => buttonWireTool.exit(),
        isButtonWireLinkActive: () => buttonWireTool.isActive(),
        isCorridorLinkWireActive: () => corridorLinkWireTool.isActive(),
        getCorridorLinkWireFromNodeId: () => corridorLinkWireTool.getFromNodeId(),
        getSelectedRoomNodeInfo: () => session.getSelectedRoomNodeInfo(),
        getSelectedRoomLinkInfo: () => session.getSelectedRoomLinkInfo(),
        getSelectedRoomLinkId: () => session.getSelectedRoomLinkId(),
        getSelectedRoomLinkCorridorIndex: () => session.getSelectedRoomLinkCorridorIndex(),
        setSelectedRoomLinkId: (linkId, corridorIndex) => session.setSelectedRoomLinkId(linkId, corridorIndex),
        deleteSelectedRoomNode: () => session.deleteSelectedRoomNode(),
        deleteSelectedRoomLink: () => session.deleteSelectedRoomLink(),
        updateSelectedRoomLink: (patch) => session.updateSelectedRoomLink(patch),
        updateSelectedRoomNode: (patch) => session.updateSelectedRoomNode(patch),
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
        setPlacePaletteKey: (key) => {
            const prevKey = session.getPlacePaletteKey();
            session.setPlacePaletteKey(key);
            if (prevKey === key) return;
            if (key.startsWith("prop:")) {
                clampSpawnBehavior();
                const asset = getPropAsset(key.slice(5));
                if (isRoomLinkSpawnAsset(asset)) {
                    enterCorridorLinkWireMode();
                    return;
                }
            }
            if (corridorLinkWireTool.isActive()) {
                corridorLinkWireTool.exit();
                session.clearRoomGraphSelection();
                session.sync();
            }
        },
        enterCorridorLinkWireMode,
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
        listPlacedSceneItems: () => session.listPlacedSceneItems(),
        isSceneItemSelected: (item) => session.isSceneItemSelected(item),
        selectSceneItem: (item) => {
            exitWireModes();
            session.selectSceneItem(item);
        },
        deleteSceneItem: (item) => session.deleteSceneItem(item),
        seedPlacementOrderFromState: () => session.seedPlacementOrderFromState(),
        getSelectedVoxelWallInfo: () => session.getSelectedVoxelWallInfo(),
        getSelectedRailWallInfo: () => session.getSelectedRailWallInfo(),
        getSelectedForcefieldInfo: () => session.getSelectedForcefieldInfo(),
        getForcefieldStampMode: () => session.getForcefieldStampMode(),
        setForcefieldStampMode: (mode) => session.setForcefieldStampMode(mode),
        setSelectedForcefieldMode: (mode) => session.setSelectedForcefieldMode(mode),
        setSelectedForcefieldAllowedSide: (side) => session.setSelectedForcefieldAllowedSide(side),
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
        setUiSync: (fn) => session.setUiSync(fn),
        getSpawnBehaviorId: () => spawnBehaviorId,
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
                if (!placePreviewWorld || canvasTools.capturesPointerMove() || canvasTools.isDragging() || canvasTools.blocksPlacePreview()) return;
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
            exitWireModes();
            marqueeTool.cancel();
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
                wireFromNodeId: corridorLinkWireTool.getFromNodeId(),
                wireCursor: corridorLinkWireTool.getCursor(),
                showRoomNodesAlways: state.editor.showRoomNodesAlways,
                wireModeActive: corridorLinkWireTool.isActive(),
            });
            drawButtonWires(ctx, state);
            buttonWireTool.drawOverlay(ctx);
            for (let i = 0; i < behaviors.length; i++) behaviors[i].drawWorldOverlay?.(ctx);
        },
        drawSelectionRings(ctx) {
            const { selectedProps } = selectionDrawState();
            drawSandboxSelectionRings(ctx, {
                selectedProps,
                showRings: state.editor.showSelectionRings,
                selectedFloorCell: session.getSelectedFloorCell(),
                selectedVoxelCell: session.getSelectedVoxelCell(),
                selectedRailEdge: session.getSelectedRailEdge(),
                grid: state.obstacleGrid,
                camera: { px: state.viewport.x, py: state.viewport.y },
            });
        },
        drawPropTileCells(ctx) {
            drawSandboxPropTileCells(ctx, { show: state.editor.showPropTileCells, grid: state.obstacleGrid, worldProps: state.worldProps });
        },
        drawMarqueeOverlay(ctx) {
            marqueeTool.drawOverlay(ctx);
        },
        drawPlacePreview(ctx) {
            if (!placePreviewWorld || canvasTools.capturesPointerMove() || canvasTools.isDragging() || canvasTools.blocksPlacePreview() || session.isMapGenPlaceMode()) return;
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
