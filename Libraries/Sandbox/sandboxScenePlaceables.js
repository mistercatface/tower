import { formatSandboxFactionLabel } from "../Sandbox/sandboxFaction.js";
import { expandGridForRoomNodeFootprint, stampRoomNodeAt, syncRoomGraphBake } from "../RoomGraph/index.js";
import { BELT_CRATE_PUZZLE_DEFAULT_AREA_COLS, BELT_CRATE_PUZZLE_DEFAULT_AREA_ROWS, stampBeltCratePuzzleAt } from "../RoomGraph/puzzleTemplateBeltCrate.js";
import { canStampFloorBeltAt, stampPassagePowerSourceAt } from "./floorOccupancy.js";
import { applyFloorCellEdit } from "./gridNavEdit.js";
import { listPlacedForcefields } from "./gridWallEdit.js";
import { markGridZoneSubscriptionsDirty } from "./gridZoneTick.js";
import { spawnPlacedSandboxProp } from "./sandboxPlacedSpawn.js";
import { setCirclePropRadius } from "../Props/propScale.js";
import { applyCrossPinwheelFootprint } from "../Props/propStrategy.js";
import { isBallFamilyAsset, blockPresetUsesResizableFootprint } from "./sandboxShapeFamilies.js";
import propCatalog from "../../Assets/props/index.js";
import {
    isGridFloorBeltSpawnAsset,
    isGridPassagePowerSourceSpawnAsset,
    isPuzzleTemplateSpawnAsset,
    isRoomLinkSpawnAsset,
    isRoomNodeSpawnAsset,
    isResizableBoxSpawnAsset,
    resolveFloorBeltKindFromSpawnAsset,
} from "./sandboxCapabilities.js";
import {
    buildFloorBeltInspectorInfo,
    buildForcefieldInspectorInfo,
    buildPassagePowerSourceInspectorInfo,
    buildRailWallInspectorInfo,
    buildRoomLinkInspectorInfo,
    buildRoomNodeInspectorInfo,
    buildVoxelWallInspectorInfo,
    selectionPrimaryPropId,
    selectionPropIds,
} from "./sandboxSelectionInspectors.js";
/** @typedef {{ seq: number, label: string, select: { kind: string }, paletteKey?: string }} SandboxSceneItem */
/** @typedef {{ kind: string, data: unknown }} SandboxSelectionInspector */
function inspectorResult(kind, data) {
    return data == null ? null : { kind, data };
}
function sceneItem(seq, label, select, paletteKey) {
    const item = { seq, label, select };
    if (paletteKey != null) item.paletteKey = paletteKey;
    return item;
}
function selectionMatchesSelect(selection, select) {
    if (!selection) return false;
    if (select.kind === "prop") return selection.kind === "prop" && selection.ids.has(select.ids[0]);
    if (select.kind === "floor") return selection.kind === "floor" && selection.col === select.col && selection.row === select.row;
    if (select.kind === "voxel") return selection.kind === "voxel" && selection.col === select.col && selection.row === select.row;
    if (select.kind === "rail") return selection.kind === "rail" && selection.col === select.col && selection.row === select.row && selection.side === select.side;
    if (select.kind === "roomNode") return selection.kind === "roomNode" && selection.id === select.id;
    if (select.kind === "roomLink") return selection.kind === "roomLink" && selection.linkId === select.linkId && selection.corridorIndex === (select.corridorIndex ?? 0);
    return false;
}
function deleteWallSceneItem(session, item, pickSelection) {
    pickSelection(item.select);
    session.deleteSelectedWall();
}
const PLACEABLE = {
    prop: {
        matchesSpawnAsset() {
            return true;
        },
        spawnAt(state, worldX, worldY, asset, ctx) {
            const propTypeId = ctx.resolveSpawnPropTypeId();
            const placedAsset = propCatalog[propTypeId];
            const halfExtents = blockPresetUsesResizableFootprint(propTypeId) ? ctx.spawnBoxHalfExtents : undefined;
            const spawned = spawnPlacedSandboxProp(state, worldX, worldY, propTypeId, ctx.spawnFaction, 0, halfExtents, ctx.resolveSpawnVisualOverride(placedAsset));
            if (spawned && isBallFamilyAsset(placedAsset)) setCirclePropRadius(spawned, ctx.spawnBallRadius);
            if (spawned && propTypeId === "cross_pinwheel") applyCrossPinwheelFootprint(spawned, ctx.spawnCrossLength, ctx.spawnCrossThickness);
            if (spawned) {
                ctx.placement.touchPropPlacement(spawned.id);
                if (ctx.selectSpawned !== false) ctx.pickSelection({ kind: "prop", ids: [spawned.id] });
            }
            return spawned != null;
        },
        buildFromSelection(state, sel, ctx) {
            const id = selectionPrimaryPropId(sel, ctx.getLiveProp);
            return id == null ? null : ctx.getLiveProp(id);
        },
        listSceneItems({ placement, listPlacedProps }) {
            const items = [];
            for (const entry of listPlacedProps())
                items.push(
                    sceneItem(
                        placement.placementSeq(placement.propPlacementKey(entry.id), entry.id),
                        `${entry.label} · ${formatSandboxFactionLabel(entry.faction)}`,
                        { kind: "prop", ids: [entry.id] },
                        `prop:${entry.type}`,
                    ),
                );
            return items;
        },
    },
    props: {
        buildFromSelection(state, sel) {
            return sel.ids.size > 1 ? { ids: selectionPropIds(sel) } : null;
        },
    },
    floorBelt: {
        matchesSpawnAsset: isGridFloorBeltSpawnAsset,
        spawnAt(state, worldX, worldY, asset, ctx) {
            const grid = state.obstacleGrid;
            const col = grid.worldCol(worldX);
            const row = grid.worldRow(worldY);
            if (!canStampFloorBeltAt(state, col, row)) return false;
            const kind = resolveFloorBeltKindFromSpawnAsset(asset);
            if (!applyFloorCellEdit(state, col, row, kind, 0)) return false;
            ctx.placement.touchFloorPlacement(col, row);
            ctx.pickSelection({ kind: "floor", col, row });
            return true;
        },
        buildFromSelection(state, sel) {
            return buildFloorBeltInspectorInfo(state, sel);
        },
        listSceneItems({ placement, listPlacedFloorBelts }) {
            const items = [];
            for (const entry of listPlacedFloorBelts())
                items.push(
                    sceneItem(placement.placementSeq(placement.floorPlacementKey(entry.col, entry.row), 1e9 + entry.col + entry.row * 1e6), entry.label, {
                        kind: "floor",
                        col: entry.col,
                        row: entry.row,
                    }),
                );
            return items;
        },
    },
    powerSource: {
        matchesSpawnAsset: isGridPassagePowerSourceSpawnAsset,
        spawnAt(state, worldX, worldY, asset, ctx) {
            const grid = state.obstacleGrid;
            const col = grid.worldCol(worldX);
            const row = grid.worldRow(worldY);
            if (!stampPassagePowerSourceAt(state, col, row, false)) return false;
            ctx.placement.touchFloorPlacement(col, row);
            ctx.pickSelection({ kind: "floor", col, row });
            return true;
        },
        buildFromSelection(state, sel) {
            return buildPassagePowerSourceInspectorInfo(state, sel);
        },
        listSceneItems({ placement, listPlacedPassagePowerSources }) {
            const items = [];
            for (const entry of listPlacedPassagePowerSources())
                items.push(
                    sceneItem(placement.placementSeq(placement.floorPlacementKey(entry.col, entry.row), 2e9 + entry.col + entry.row * 1e6), entry.label, {
                        kind: "floor",
                        col: entry.col,
                        row: entry.row,
                    }),
                );
            return items;
        },
    },
    voxel: {
        buildFromSelection(state, sel) {
            return buildVoxelWallInspectorInfo(state, sel);
        },
        listSceneItems({ placement }) {
            const items = [];
            for (const entry of placement.listTrackedVoxelWalls())
                items.push(
                    sceneItem(
                        placement.placementSeq(placement.voxelPlacementKey(entry.col, entry.row), 3e9 + entry.col + entry.row * 1e6),
                        entry.label,
                        { kind: "voxel", col: entry.col, row: entry.row },
                        "wall:voxel",
                    ),
                );
            return items;
        },
    },
    rail: {
        buildFromSelection(state, sel) {
            return buildRailWallInspectorInfo(state, sel);
        },
        listSceneItems({ placement }) {
            const items = [];
            for (const entry of placement.listTrackedRailWalls())
                items.push(
                    sceneItem(
                        placement.placementSeq(placement.edgePlacementKey("rail", entry.col, entry.row, entry.side), 4e9 + entry.col + entry.row * 1e6 + entry.side),
                        entry.label,
                        { kind: "rail", col: entry.col, row: entry.row, side: entry.side },
                        "wall:rail",
                    ),
                );
            return items;
        },
    },
    forcefield: {
        buildFromSelection(state, sel) {
            return buildForcefieldInspectorInfo(state, sel);
        },
        listSceneItems({ state, placement }) {
            const items = [];
            for (const entry of listPlacedForcefields(state.obstacleGrid))
                items.push(
                    sceneItem(
                        placement.placementSeq(placement.edgePlacementKey("forcefield", entry.col, entry.row, entry.side), 5e9 + entry.col + entry.row * 1e6 + entry.side),
                        entry.label,
                        { kind: "rail", col: entry.col, row: entry.row, side: entry.side },
                        "wall:forcefield",
                    ),
                );
            return items;
        },
    },
    roomNode: {
        matchesSpawnAsset: isRoomNodeSpawnAsset,
        spawnAt(state, worldX, worldY, asset, ctx) {
            const grid = state.obstacleGrid;
            const col = grid.worldCol(worldX);
            const row = grid.worldRow(worldY);
            expandGridForRoomNodeFootprint(state, col, row, ctx.spawnRoomNodeCols, ctx.spawnRoomNodeRows);
            const node = stampRoomNodeAt(state, col, row, ctx.spawnRoomNodeCols, ctx.spawnRoomNodeRows);
            if (!node) return false;
            ctx.placement.touchRoomNodePlacement(node.id);
            ctx.pickSelection({ kind: "roomNode", id: node.id });
            syncRoomGraphBake(state);
            ctx.notifyUi();
            return true;
        },
        buildFromSelection(state, sel) {
            return buildRoomNodeInspectorInfo(state, sel);
        },
        listSceneItems({ placement, listPlacedRoomNodes }) {
            const items = [];
            for (const entry of listPlacedRoomNodes())
                items.push(sceneItem(placement.placementSeq(placement.roomNodePlacementKey(entry.id), 7e9 + entry.id), entry.label, { kind: "roomNode", id: entry.id }));
            return items;
        },
    },
    puzzleTemplate: {
        matchesSpawnAsset: isPuzzleTemplateSpawnAsset,
        spawnAt(state, worldX, worldY, asset, ctx) {
            const grid = state.obstacleGrid;
            const col = grid.worldCol(worldX);
            const row = grid.worldRow(worldY);
            const stamped = stampBeltCratePuzzleAt(state, col, row, ctx.spawnPuzzleAreaCols, ctx.spawnPuzzleAreaRows);
            if (!stamped) return false;
            ctx.placement.touchRoomNodePlacement(stamped.roomA.id);
            ctx.placement.touchRoomNodePlacement(stamped.roomB.id);
            ctx.placement.touchRoomNodePlacement(stamped.roomC.id);
            for (let i = 0; i < stamped.links.length; i++) ctx.placement.touchRoomLinkCorridors(stamped.links[i]);
            ctx.pickSelection({ kind: "roomNode", id: stamped.roomA.id });
            ctx.notifyUi();
            return true;
        },
    },
    roomLink: {
        matchesSpawnAsset: isRoomLinkSpawnAsset,
        spawnAt() {
            return false;
        },
        buildFromSelection(state, sel) {
            return buildRoomLinkInspectorInfo(state, sel);
        },
        listSceneItems({ placement, listPlacedRoomLinks }) {
            const items = [];
            for (const entry of listPlacedRoomLinks())
                items.push(
                    sceneItem(placement.placementSeq(placement.roomLinkPlacementKey(entry.linkId, entry.corridorIndex), 8e9 + entry.linkId + entry.corridorIndex * 1e6), entry.label, {
                        kind: "roomLink",
                        linkId: entry.linkId,
                        corridorIndex: entry.corridorIndex,
                        nodeId: null,
                    }),
                );
            return items;
        },
    },
};
const SPAWN_ROWS = [PLACEABLE.floorBelt, PLACEABLE.powerSource, PLACEABLE.roomNode, PLACEABLE.puzzleTemplate, PLACEABLE.roomLink, PLACEABLE.prop];
const FROM_SELECTION = {
    prop(state, sel, ctx) {
        if (sel.ids.size > 1) return inspectorResult("props", PLACEABLE.props.buildFromSelection(state, sel, ctx));
        return inspectorResult("prop", PLACEABLE.prop.buildFromSelection(state, sel, ctx));
    },
    floor(state, sel, ctx) {
        return inspectorResult("floorBelt", PLACEABLE.floorBelt.buildFromSelection(state, sel, ctx)) ?? inspectorResult("powerSource", PLACEABLE.powerSource.buildFromSelection(state, sel, ctx));
    },
    voxel(state, sel, ctx) {
        return inspectorResult("voxel", PLACEABLE.voxel.buildFromSelection(state, sel, ctx));
    },
    rail(state, sel, ctx) {
        return inspectorResult("forcefield", PLACEABLE.forcefield.buildFromSelection(state, sel, ctx)) ?? inspectorResult("rail", PLACEABLE.rail.buildFromSelection(state, sel, ctx));
    },
    roomNode(state, sel, ctx) {
        return inspectorResult("roomNode", PLACEABLE.roomNode.buildFromSelection(state, sel, ctx));
    },
    roomLink(state, sel, ctx) {
        return inspectorResult("roomLink", PLACEABLE.roomLink.buildFromSelection(state, sel, ctx));
    },
};
const DELETE_BY_SELECT_KIND = {
    prop(session, item) {
        session.deletePropById(item.select.ids[0]);
    },
    floor(session, item, pickSelection) {
        pickSelection(item.select);
        session.deleteSelectedFloorCell();
    },
    voxel: deleteWallSceneItem,
    rail: deleteWallSceneItem,
    roomNode(session, item, pickSelection) {
        pickSelection(item.select);
        session.deleteSelectedRoomNode();
    },
    roomLink(session, item, pickSelection) {
        pickSelection(item.select);
        session.deleteSelectedRoomLink();
    },
};
const SCENE_LISTERS = [
    PLACEABLE.prop.listSceneItems,
    PLACEABLE.floorBelt.listSceneItems,
    PLACEABLE.powerSource.listSceneItems,
    PLACEABLE.voxel.listSceneItems,
    PLACEABLE.rail.listSceneItems,
    PLACEABLE.forcefield.listSceneItems,
    PLACEABLE.roomNode.listSceneItems,
    PLACEABLE.roomLink.listSceneItems,
];
export function spawnPlaceableAt(state, worldX, worldY, asset, ctx) {
    for (let i = 0; i < SPAWN_ROWS.length; i++) {
        const row = SPAWN_ROWS[i];
        if (!row.matchesSpawnAsset(asset)) continue;
        return row.spawnAt(state, worldX, worldY, asset, ctx);
    }
    return false;
}
export function buildSelectionInspector(state, selection, getLiveProp, pruneSelection) {
    pruneSelection();
    const sel = selection.getSelection();
    if (!sel) return null;
    return FROM_SELECTION[sel.kind](state, sel, { getLiveProp });
}
export function wallPlaceInspector(inspector) {
    if (inspector?.kind === "voxel" || inspector?.kind === "rail") return inspector;
    return null;
}
export const PLACEABLE_INSPECTOR_KINDS = ["prop", "floorBelt", "powerSource", "voxel", "rail", "forcefield", "roomNode", "roomLink"];
export function listPlacedSceneItems(ctx) {
    const items = [];
    for (let i = 0; i < SCENE_LISTERS.length; i++) items.push(...SCENE_LISTERS[i](ctx));
    items.sort((a, b) => a.seq - b.seq);
    return items;
}
export function matchesSceneItem(selection, item) {
    return selectionMatchesSelect(selection, item.select);
}
export function pickSceneItem(item, { pickSelection }) {
    pickSelection(item.select);
}
export function removeSceneItem(session, item, pickSelection) {
    DELETE_BY_SELECT_KIND[item.select.kind](session, item, pickSelection);
}
