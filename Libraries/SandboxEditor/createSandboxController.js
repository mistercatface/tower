import { assetDefaultBallRadius, isBallFamilyAsset } from "../Sandbox/sandboxShapeFamilies.js";
import { bindCanvasPointers, bindCanvasContextMenu } from "../Input/canvasPointer.js";
import { createCanvasToolStack } from "../Editor/canvasToolStack.js";
import { createSandboxSession } from "../Sandbox/sandboxSession.js";
import { clearButtonLinks, listButtonLinkEndpoints, removeButtonLink } from "../Sandbox/buttonLinks.js";
import { isButtonEntity } from "../Sandbox/buttonInput.js";
import { createButtonWireTool } from "./buttonWireTool.js";
import { createChainLinkWireTool } from "./chainLinkWireTool.js";
import { createCorridorLinkWireTool } from "./corridorLinkWireTool.js";
import { createSandboxMarqueeTool } from "./sandboxMarqueeTool.js";
import { createSandboxGroundNavContextMenu } from "./sandboxGroundNavContextMenu.js";
import { createSandboxDeletePointerTool } from "./sandboxDeletePointerTool.js";
import { createSandboxPointerGestures } from "./sandboxPointerGestures.js";
import { createSandboxPrimaryPointerTools } from "./sandboxPrimaryPointerTool.js";
import { releaseButtonPointerHold } from "../Sandbox/floorButtons.js";
import { applySandboxSceneSnapshot, collectSandboxSceneSnapshot, parseSandboxSceneSnapshot } from "../Sandbox/sandboxSceneSnapshot.js";
import { spawnSandboxStartScene } from "../../Apps/Editor/world/sandboxStartScene.js";
import { buildSandboxOverlayCommands } from "./buildSandboxOverlayCommands.js";
import { kineticSpatial } from "../../Systems/World/KineticSpatialFrame.js";
import { resolveSandboxBehaviors, isRoomLinkSpawnAsset } from "../Sandbox/sandboxCapabilities.js";
import { createAabb } from "../Math/Aabb2D.js";
import { resolveSandboxPathVisual, setSandboxPathVisual } from "../Sandbox/sandboxPropMeta.js";
import { isSandboxCameraTarget, setSandboxCameraTarget } from "../Sandbox/sandboxCameraTarget.js";
import { FollowCamera } from "../Sandbox/FollowCamera.js";
import { getSandboxEntityMeta } from "../../GameState/sandboxEntityMeta.js";
import { removeKineticConstraint } from "../Motion/kineticConstraints.js";
import { clearChainLinksForProp, isChainLinkBall, listChainLinkEndpoints, resolveGroundNavSteeringProp, setChainHead } from "../Sandbox/chainLinks.js";
import { countNavPropsInSelection, issueGroundNavToSelection } from "../Sandbox/groundNav/groundNavSelectionMenu.js";
import { selectionPropIds } from "../Sandbox/sandboxSelectionInspectors.js";
import propCatalog from "../../Assets/props/index.js";
/**
 * @param {object} state
 * @param {{
 *   getCanvas: () => HTMLCanvasElement,
 *   clientToWorld: (clientX: number, clientY: number) => { x: number, y: number },
 *   behaviors: import("../Sandbox/sandboxCapabilities.js").SandboxBehavior[],
 * }} options
 */
export function createSandboxController(state, { getCanvas, clientToWorld, behaviors }) {
    state.sandbox.behaviors = behaviors;
    const session = createSandboxSession(state);
    const cameraCycler = new FollowCamera(state);
    cameraCycler.registerCandidateList(() => session.listPlacedProps());
    cameraCycler.addOnTargetChanged(() => session.sync());
    const behaviorById = new Map(behaviors.map((behavior) => [behavior.id, behavior]));
    let spawnBehaviorId = behaviors[0]?.id ?? "";
    /** @type {(() => void) | null} */
    let unbindPointers = null;
    /** @type {(() => void) | null} */
    let unbindContextMenu = null;
    /** @type {(() => void) | null} */
    let unbindKeyDown = null;
    /** @type {{ x: number, y: number } | null} */
    let placePreviewWorld = null;
    const entityMeta = () => getSandboxEntityMeta(state);
    const spawnAsset = () => propCatalog[session.getSpawnPropId()];
    /** @param {string} id @param {string[]} allowed */
    const clampBehaviorId = (id, allowed) => {
        if (allowed.length === 0) return id;
        return allowed.includes(id) ? id : allowed[0];
    };
    const listSpawnBehaviors = () => resolveSandboxBehaviors(spawnAsset(), state, null);
    const clampSpawnBehavior = () => {
        spawnBehaviorId = clampBehaviorId(spawnBehaviorId, listSpawnBehaviors());
    };
    /** @param {object | null | undefined} prop */
    const listSelectedBehaviors = (prop = session.getSelectedProp()) => {
        if (!prop) return [];
        return resolveSandboxBehaviors(propCatalog[prop.type], state, prop);
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
    const chainLinkWireTool = createChainLinkWireTool(state, session);
    const corridorLinkWireTool = createCorridorLinkWireTool(state, session);
    const wallPlaceTool = {
        isActive: () => session.isWallPlaceMode(),
        blocksPlacement: () => session.isWallPlaceMode(),
        onPointerDown(world, e) {
            if (e.button === 2) {
                session.deleteWallAtWorld(world.x, world.y);
                return true;
            }
            if (e.button !== 0) return false;
            if (session.pickWallAtWorld(world.x, world.y)) return true;
            session.stampWallAtWorld(world.x, world.y);
            return true;
        },
    };
    const blocksPlacement = () =>
        (buttonWireTool.isActive() && buttonWireTool.blocksPlacement()) ||
        (chainLinkWireTool.isActive() && chainLinkWireTool.blocksPlacement()) ||
        (corridorLinkWireTool.isActive() && corridorLinkWireTool.blocksPlacement()) ||
        (wallPlaceTool.isActive() && wallPlaceTool.blocksPlacement());
    const exitWireModes = () => {
        buttonWireTool.exit();
        chainLinkWireTool.exit();
        corridorLinkWireTool.exit();
    };
    const dismissEditorFocus = () => {
        exitWireModes();
        groundNavContextMenu.close();
        marqueeTool.cancel();
        placePreviewWorld = null;
        session.clearSelection();
        session.clearPlaceMode();
        session.sync();
    };
    const selectProp = (id) => {
        exitWireModes();
        session.select(id == null ? null : { kind: "prop", ids: [id] });
        const prop = session.getSelectedProp();
        if (prop && entityMeta().getActiveBehaviorId(prop.id) == null) {
            const allowed = listSelectedBehaviors(prop);
            if (allowed.length > 0) entityMeta().setActiveBehaviorId(prop.id, allowed[0]);
        }
    };
    const togglePropInSelection = (id) => {
        exitWireModes();
        const sel = session.getSelection();
        const removing = sel?.kind === "prop" && sel.ids.has(id);
        if (!session.togglePropInSelection(id)) return;
        if (!removing) {
            const prop = state.entityRegistry.getLive(id);
            if (prop && entityMeta().getActiveBehaviorId(prop.id) == null) {
                const allowed = listSelectedBehaviors(prop);
                if (allowed.length > 0) entityMeta().setActiveBehaviorId(prop.id, allowed[0]);
            }
        }
        session.sync();
    };
    const selectPropIds = (ids) => {
        exitWireModes();
        session.select({ kind: "prop", ids });
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
        const sel = session.getSelection();
        if (sel?.kind !== "prop") return null;
        const prop = resolveGroundNavSteeringProp(state, entityMeta(), selectionPropIds(sel));
        if (!prop || prop.type === "boid_triangle") return null;
        const allowed = listSelectedBehaviors(prop);
        const behavior = behaviorById.get(clampBehaviorId(entityMeta().getActiveBehaviorId(prop.id) ?? spawnBehaviorId, allowed)) ?? null;
        if (!behavior?.setMoveTarget || !allowed.includes(behavior.id)) return null;
        return { prop, behavior };
    };
    const issueGroundMove = (move, world) => {
        move.behavior.setMoveTarget(move.prop, world);
    };
    const issueGroundNavToSelected = (behaviorId, world) => {
        const sel = session.getSelection();
        if (sel?.kind !== "prop") return 0;
        const moved = issueGroundNavToSelection(state, { propIds: selectionPropIds(sel), behaviorId, world, behaviorById, entityMeta: entityMeta() });
        if (moved > 0) session.sync();
        return moved;
    };
    const groundNavContextMenu = createSandboxGroundNavContextMenu(state, session, { behaviorById, entityMeta, onIssued: () => session.sync() });
    const deletePointerTool = createSandboxDeletePointerTool(state, session);
    const { modifierTool, interactTool, gestureTool } = createSandboxPrimaryPointerTools(state, session, {
        stampPropBehavior,
        blocksPlacement,
        exitWireModes,
        resolveBehavior,
        resolveGroundMove,
        gestures,
        issueGroundNavToSelected,
    });
    const marqueeTool = createSandboxMarqueeTool(state, session, { getCanvas, aabbScratch: MARQUEE_AABB, stampPropBehavior, selectPropIds });
    const canvasTools = createCanvasToolStack([modifierTool, wallPlaceTool, deletePointerTool, buttonWireTool, chainLinkWireTool, corridorLinkWireTool, interactTool, gestureTool, marqueeTool], {
        clientToWorld,
    });
    const enterCorridorLinkWireMode = () => {
        buttonWireTool.exit();
        chainLinkWireTool.exit();
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
        getSpawnBoxWidth: () => session.getSpawnBoxWidth(),
        setSpawnBoxWidth: (width) => session.setSpawnBoxWidth(width),
        getSpawnBoxHeight: () => session.getSpawnBoxHeight(),
        setSpawnBoxHeight: (height) => session.setSpawnBoxHeight(height),
        getSpawnCrossLength: () => session.getSpawnCrossLength(),
        setSpawnCrossLength: (len) => session.setSpawnCrossLength(len),
        getSpawnCrossThickness: () => session.getSpawnCrossThickness(),
        setSpawnCrossThickness: (thick) => session.setSpawnCrossThickness(thick),
        getSpawnSnakeLength: () => session.getSpawnSnakeLength(),
        setSpawnSnakeLength: (length) => session.setSpawnSnakeLength(length),
        getSpawnBallRadius: (asset) => session.getSpawnBallRadius(asset),
        setSpawnBallRadius: (radius) => session.setSpawnBallRadius(radius),
        getSpawnVisualOverrideTint: (asset) => session.getSpawnVisualOverrideTint(asset),
        setSpawnVisualOverrideTint: (hex) => session.setSpawnVisualOverrideTint(hex),
        getSpawnVisualOverrideBrightness: () => session.getSpawnVisualOverrideBrightness(),
        setSpawnVisualOverrideBrightness: (brightness) => session.setSpawnVisualOverrideBrightness(brightness),
        deleteSelectedProps: () => {
            const sel = session.getSelection();
            if (sel?.kind === "prop") for (const propId of sel.ids) cameraCycler.retarget(propId);
            session.deleteSelectedProps();
        },
        getSelectionTagFilter: () => session.getSelectionTagFilter(),
        setSelectionTagFilter: (filter) => session.setSelectionTagFilter(filter),
        listSelectedPropEntries: () => session.listSelectedPropEntries(),
        selectAllPropsWithTagFilter: (filter) => session.selectAllPropsWithTagFilter(filter),
        filterPropSelectionToTag: (filter) => session.filterPropSelectionToTag(filter),
        countSelectedNavProps: () => {
            const sel = session.getSelection();
            if (sel?.kind !== "prop") return 0;
            return countNavPropsInSelection(state, selectionPropIds(sel), entityMeta());
        },
        issueGroundNavToSelection: issueGroundNavToSelected,
        getSelection: () => session.getSelection(),
        getSelectedProp: () => session.getSelectedProp(),
        getSelectionInspector: () => session.getSelectionInspector(),
        select: (input) => {
            exitWireModes();
            session.select(input);
        },
        startButtonWireLink: () => {
            corridorLinkWireTool.exit();
            chainLinkWireTool.exit();
            buttonWireTool.startLink();
        },
        cancelButtonWireLink: () => buttonWireTool.exit(),
        isButtonWireLinkActive: () => buttonWireTool.isActive(),
        startChainLink: () => {
            corridorLinkWireTool.exit();
            buttonWireTool.exit();
            chainLinkWireTool.startLink();
        },
        cancelChainLink: () => chainLinkWireTool.exit(),
        isChainLinkActive: () => chainLinkWireTool.isActive(),
        clearSelectedChainLinks: () => {
            const prop = session.getSelectedProp();
            if (!prop || !isChainLinkBall(prop)) return;
            clearChainLinksForProp(state, prop.id);
            session.sync();
        },
        removeSelectedChainLink: (constraintId) => {
            removeKineticConstraint(state.kinetic, constraintId);
            session.sync();
        },
        listSelectedChainLinks: () => {
            const prop = session.getSelectedProp();
            if (!prop || !isChainLinkBall(prop)) return [];
            return listChainLinkEndpoints(state, prop.id);
        },
        setSelectedChainHead: (enabled) => {
            const prop = session.getSelectedProp();
            if (!prop || !isChainLinkBall(prop)) return;
            if (enabled) setChainHead(state, entityMeta(), prop.id);
            else entityMeta().setChainHead(prop.id, false);
            session.sync();
        },
        isSelectedChainHead: () => {
            const prop = session.getSelectedProp();
            return prop ? entityMeta().isChainHead(prop.id) : false;
        },
        isCorridorLinkWireActive: () => corridorLinkWireTool.isActive(),
        getCorridorLinkWireFromNodeId: () => corridorLinkWireTool.getFromNodeId(),
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
        deletePropById: (id) => {
            cameraCycler.retarget(id);
            session.deletePropById(id);
        },
        removePropFromSelection: (id) => session.removePropFromSelection(id),
        listPlacedProps: () => session.listPlacedProps(),
        listPlacedFloorBelts: () => session.listPlacedFloorBelts(),
        stampPassagePowerSourceAtWorld: (worldX, worldY, defaultPowered) => session.stampPassagePowerSourceAtWorld(worldX, worldY, defaultPowered),
        listPlacedPassagePowerSources: () => session.listPlacedPassagePowerSources(),
        rotateSelectedFloorBelt: (steps) => session.rotateSelectedFloorBelt(steps),
        moveSelectedFloorBeltTo: (col, row) => session.moveSelectedFloorBeltTo(col, row),
        setSelectedFloorBeltKind: (kind) => session.setSelectedFloorBeltKind(kind),
        deleteSelectedFloorCell: () => session.deleteSelectedFloorCell(),
        setSelectedPassagePowerSourceDefaultPowered: (powered) => session.setSelectedPassagePowerSourceDefaultPowered(powered),
        getPlacePaletteKey: () => session.getPlacePaletteKey(),
        setPlacePaletteKey: (key) => {
            const prevKey = session.getPlacePaletteKey();
            session.setPlacePaletteKey(key);
            if (prevKey === key) return;
            if (key.startsWith("prop:")) {
                clampSpawnBehavior();
                const asset = propCatalog[key.slice(5)];
                if (isBallFamilyAsset(asset)) session.setSpawnBallRadius(assetDefaultBallRadius(asset));
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
            cameraCycler.clear();
            resetBehaviors();
            exitWireModes();
            session.clearSelection();
            session.seedPlacementOrderFromState();
            session.sync();
        },
        async loadStartScene() {
            await spawnSandboxStartScene(state);
            cameraCycler.clear();
            resetBehaviors();
            exitWireModes();
            session.clearSelection();
            session.seedPlacementOrderFromState();
            session.sync();
        },
        getBehaviorByIdMap: () => behaviorById,
        sync: session.sync,
        session,
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
            unbindContextMenu = bindCanvasContextMenu(getCanvas(), (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (state.editor.lockSelection) return;
                if (session.isWallPlaceMode()) return;
                const world = clientToWorld(e.clientX, e.clientY);
                groundNavContextMenu.tryOpen(e.clientX, e.clientY, world);
            });
            const onKeyDown = (e) => {
                if (e.target instanceof HTMLElement && (e.target.isContentEditable || e.target.matches("textarea, select, input"))) return;
                if (e.code === "Escape") {
                    if (groundNavContextMenu.isOpen()) {
                        groundNavContextMenu.close();
                        e.preventDefault();
                        return;
                    }
                    dismissEditorFocus();
                    e.preventDefault();
                    return;
                }
                if (!placePreviewWorld || canvasTools.capturesPointerMove() || canvasTools.isDragging() || canvasTools.blocksPlacePreview()) return;
                if (session.rotateHoveredGridOccupantAtWorld(placePreviewWorld.x, placePreviewWorld.y)) e.preventDefault();
            };
            window.addEventListener("keydown", onKeyDown);
            unbindKeyDown = () => window.removeEventListener("keydown", onKeyDown);
            cameraCycler.bindInput();
        },
        destroy() {
            unbindKeyDown?.();
            unbindKeyDown = null;
            unbindPointers?.();
            unbindPointers = null;
            unbindContextMenu?.();
            unbindContextMenu = null;
            exitWireModes();
            groundNavContextMenu.close();
            marqueeTool.cancel();
            placePreviewWorld = null;
            resetBehaviors();
            session.setUiSync(null);
            cameraCycler.destroy();
        },
        clearBodies() {
            session.clear();
            cameraCycler.clear();
            resetBehaviors();
        },
        collectOverlayCommands() {
            const showPlacePreview = placePreviewWorld && !canvasTools.capturesPointerMove() && !canvasTools.isDragging() && !canvasTools.blocksPlacePreview() && !session.isMapGenPlaceMode();
            return buildSandboxOverlayCommands({
                state,
                session,
                spatialFrame: kineticSpatial,
                placePreviewWorld: showPlacePreview ? placePreviewWorld : null,
                marqueeRect: marqueeTool.getMarqueeRect(),
                behaviorById,
                getPropBehaviorId,
                buttonWireTool,
                chainLinkWireTool,
                corridorLinkWireTool,
                resolveBehavior,
                selectedProp: session.getSelectedProp(),
            });
        },
        tick(dtMs) {
            session.pruneSelection();
            for (let i = 0; i < behaviors.length; i++) behaviors[i].tickWorld?.(dtMs);
            const prop = session.getSelectedProp();
            const behavior = resolveBehavior();
            if (!prop || !behavior?.tick) return;
            if (behavior.tickWorld) return;
            behavior.tick(prop, dtMs);
        },
        getPathVisual(prop) {
            return resolveSandboxPathVisual(state, prop);
        },
        setPathVisual(visual, prop) {
            setSandboxPathVisual(state, prop, visual);
            session.sync();
        },
        isCameraTarget(prop) {
            return cameraCycler.targetProp?.id === prop.id;
        },
        setCameraTarget(enabled, prop) {
            if (enabled) cameraCycler.focus(prop);
            else if (cameraCycler.targetProp === prop) cameraCycler.clear();
            session.sync();
        },
    };
    return controller;
}
