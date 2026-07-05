import { formatSandboxFactionLabel } from "../Sandbox/sandboxFaction.js";
import { FloorBelt } from "../Spatial/grid/FloorCell.js";
import { findGridAnchoredFloorPropAtIdx } from "../Spatial/zones/floorShapes.js";
import { applyFloorCellEdit } from "./gridNavEdit.js";
import { spawnPlacedSandboxProp } from "./sandboxPlacedSpawn.js";
import { spawnLinkedBallChain } from "./spawnLinkedBallChain.js";
import { setPropVisualBrightness, setPropVisualTint } from "../Color/visualOverride.js";
import { setPropRadius } from "../Props/props.js";
import { applyCrossPinwheelFootprint } from "../Props/props.js";
import { isBallFamilyAsset, blockPresetUsesResizableFootprint } from "./sandboxShapeFamilies.js";
import propCatalog from "../../Assets/props/index.js";
import { isGridFloorBeltSpawnAsset, isResizableBoxSpawnAsset, resolveFloorBeltKindFromSpawnAsset } from "./sandboxCapabilities.js";
import { buildFloorBeltInspectorInfo, buildRailWallInspectorInfo, buildVoxelWallInspectorInfo } from "./sandboxSelectionInspectors.js";
function sceneItem(seq, label, select, category = "") {
    return { seq, label, select, category };
}
function selectionMatchesSelect(selection, select) {
    if (!selection) return false;
    if (selection.kind !== select.kind) return false;
    if (selection.kind === "prop") {
        if (selection.ids.size !== select.ids.length) return false;
        for (let i = 0; i < select.ids.length; i++) if (!selection.ids.has(select.ids[i])) return false;
        return true;
    }
    if (selection.kind === "floor" || selection.kind === "voxel") return selection.col === select.col && selection.row === select.row;
    if (selection.kind === "rail") return selection.col === select.col && selection.row === select.row && selection.side === select.side;
    return false;
}
function inspectorResult(kind, data) {
    return data == null ? null : { kind, data };
}
function deleteWallSceneItem(session, item) {
    const edge = item.select;
    session.deleteWallAt(edge.col, edge.row, edge.side);
}
export const PLACEABLE = {
    props: {
        buildFromSelection(state, sel) {
            return sel.ids.size > 1 ? { ids: [...sel.ids] } : null;
        },
    },
    prop: {
        matchesSpawnAsset() {
            return true;
        },
        spawnAt(state, worldX, worldY, asset, ctx) {
            const propTypeId = ctx.resolveSpawnPropTypeId();
            if (propTypeId === "snake") {
                const grid = state.obstacleGrid;
                const idx = grid.worldToIdx(worldX, worldY);
                if (idx === -1) return false;
                const chain = spawnLinkedBallChain(state, idx, {
                    headBallType: "snake",
                    ballType: "ball",
                    segmentCount: ctx.spawnSnakeLength,
                    segmentRadius: ctx.spawnBallRadius,
                    faction: ctx.spawnFaction,
                    spacing: ctx.spawnBallRadius * 2,
                    linkSlack: 1.0,
                });
                if (chain && chain.leader) {
                    const visualOverride = ctx.resolveSpawnVisualOverride(propCatalog["snake"]);
                    if (visualOverride) {
                        if (visualOverride.tint) setPropVisualTint(chain.leader, visualOverride.tint);
                        if (visualOverride.brightness != null) setPropVisualBrightness(chain.leader, visualOverride.brightness);
                    }
                    ctx.placement.touchPropPlacement(chain.leader.id);
                    if (ctx.selectSpawned !== false) ctx.pickSelection({ kind: "prop", ids: [chain.leader.id] });
                }
                return chain != null;
            }
            const placedAsset = propCatalog[propTypeId];
            const halfExtents = blockPresetUsesResizableFootprint(propTypeId) ? ctx.spawnBoxHalfExtents : undefined;
            const spawned = spawnPlacedSandboxProp(state, worldX, worldY, propTypeId, ctx.spawnFaction, 0, halfExtents, ctx.resolveSpawnVisualOverride(placedAsset));
            if (spawned && isBallFamilyAsset(placedAsset)) setPropRadius(spawned, ctx.spawnBallRadius);
            if (spawned && propTypeId === "cross_pinwheel") applyCrossPinwheelFootprint(spawned, ctx.spawnCrossLength, ctx.spawnCrossThickness);
            if (spawned) {
                ctx.placement.touchPropPlacement(spawned.id);
                if (ctx.selectSpawned !== false) ctx.pickSelection({ kind: "prop", ids: [spawned.id] });
            }
            return spawned != null;
        },
        buildFromSelection(state, sel, { getLiveProp }) {
            if (sel.ids.size !== 1) return null;
            const id = [...sel.ids][0];
            return getLiveProp(id);
        },
        mutate(state, sel, patch, { getLiveProp, notifyUi }) {
            let changed = false;
            for (const id of sel.ids) {
                const prop = getLiveProp(id);
                if (!prop) continue;
                const asset = propCatalog[prop.spawnTypeId];
                if (!asset) continue;
                if (patch.faction !== undefined && prop.faction !== patch.faction) {
                    prop.faction = patch.faction;
                    changed = true;
                }
                if (patch.visualTint !== undefined) {
                    setPropVisualTint(prop, patch.visualTint);
                    changed = true;
                }
                if (patch.visualBrightness !== undefined) {
                    setPropVisualBrightness(prop, patch.visualBrightness);
                    changed = true;
                }
                if (patch.ballRadius !== undefined && isBallFamilyAsset(asset)) {
                    setPropRadius(prop, patch.ballRadius);
                    changed = true;
                }
                if ((patch.boxWidth !== undefined || patch.boxHeight !== undefined) && blockPresetUsesResizableFootprint(asset)) {
                    const w = patch.boxWidth ?? prop.shape.halfExtents.x * 2;
                    const h = patch.boxHeight ?? prop.shape.halfExtents.y * 2;
                    state.kinetic.setBoxShapeHalfExtents(prop, w / 2, h / 2);
                    changed = true;
                }
                if ((patch.crossLength !== undefined || patch.crossThickness !== undefined) && asset.id === "cross_pinwheel") {
                    const len = patch.crossLength ?? prop.shape.length;
                    const thick = patch.crossThickness ?? prop.shape.thickness;
                    applyCrossPinwheelFootprint(prop, len, thick);
                    changed = true;
                }
            }
            if (changed) notifyUi();
            return changed;
        },
        listSceneItems({ placement, listPlacedProps }) {
            const items = [];
            const props = listPlacedProps();
            for (let i = 0; i < props.length; i++) {
                const prop = props[i];
                const asset = propCatalog[prop.spawnTypeId ?? prop.type];
                if (!asset) continue;
                const label = `${prop.label ?? asset.label} · ${formatSandboxFactionLabel(prop.faction)}`;
                items.push(sceneItem(placement.placementSeq(placement.propPlacementKey(prop.id), prop.id), label, { kind: "prop", ids: [prop.id] }, `prop:${prop.spawnTypeId ?? prop.type}`));
            }
            return items;
        },
    },
    floorBelt: {
        matchesSpawnAsset: isGridFloorBeltSpawnAsset,
        spawnAt(state, worldX, worldY, asset, ctx) {
            const grid = state.obstacleGrid;
            const idx = grid.worldToIdx(worldX, worldY);
            if (!FloorBelt.canStampAt(state, idx, findGridAnchoredFloorPropAtIdx)) return false;
            const kind = resolveFloorBeltKindFromSpawnAsset(asset);
            if (!applyFloorCellEdit(state, idx, kind, 0)) return false;
            ctx.placement.touchFloorPlacement(idx);
            ctx.pickSelection({ kind: "floor", idx });
            return true;
        },
        buildFromSelection(state, sel) {
            return buildFloorBeltInspectorInfo(state, sel);
        },
        listSceneItems({ placement, listPlacedFloorBelts }) {
            const items = [];
            for (const entry of listPlacedFloorBelts())
                items.push(sceneItem(placement.placementSeq(placement.floorPlacementKey(entry.idx), 2e9 + entry.idx), entry.label, { kind: "floor", idx: entry.idx }, "floor"));
            return items;
        },
    },
    voxel: {
        matchesSpawnAsset(asset) {
            return asset.category === "block" && !isResizableBoxSpawnAsset(asset);
        },
        spawnAt() {
            return false;
        },
        buildFromSelection(state, sel) {
            return buildVoxelWallInspectorInfo(state, sel);
        },
        listSceneItems({ placement }) {
            const items = [];
            for (const entry of placement.listTrackedVoxelWalls())
                items.push(sceneItem(placement.placementSeq(placement.voxelPlacementKey(entry.idx), 3e9 + entry.idx), entry.label, { kind: "voxel", idx: entry.idx }, "wall:voxel"));
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
                        placement.placementSeq(placement.edgePlacementKey("rail", entry.idx, entry.side), 4e9 + entry.idx + entry.side * 1e8),
                        entry.label,
                        { kind: "rail", idx: entry.idx, side: entry.side },
                        "wall:rail",
                    ),
                );
            return items;
        },
    },
};
const SPAWN_ROWS = [PLACEABLE.floorBelt, PLACEABLE.prop];
const FROM_SELECTION = {
    prop(state, sel, ctx) {
        if (sel.ids.size > 1) return inspectorResult("props", PLACEABLE.props.buildFromSelection(state, sel, ctx));
        return inspectorResult("prop", PLACEABLE.prop.buildFromSelection(state, sel, ctx));
    },
    floor(state, sel, ctx) {
        return inspectorResult("floorBelt", PLACEABLE.floorBelt.buildFromSelection(state, sel, ctx));
    },
    voxel(state, sel, ctx) {
        return inspectorResult("voxel", PLACEABLE.voxel.buildFromSelection(state, sel, ctx));
    },
    rail(state, sel, ctx) {
        return inspectorResult("rail", PLACEABLE.rail.buildFromSelection(state, sel, ctx));
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
};
const SCENE_LISTERS = [PLACEABLE.prop.listSceneItems, PLACEABLE.floorBelt.listSceneItems, PLACEABLE.voxel.listSceneItems, PLACEABLE.rail.listSceneItems];
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
export const PLACEABLE_INSPECTOR_KINDS = ["prop", "floorBelt", "voxel", "rail"];
export function listPlacedSceneItems(ctx) {
    const items = [];
    for (let i = 0; i < SCENE_LISTERS.length; i++) items.push(...SCENE_LISTERS[i](ctx));
    items.sort((a, b) => a.seq - b.seq);
    return items;
}
export function matchesSceneItem(selection, item) {
    return selectionMatchesSelect(selection, item.select);
}
export function pickSceneItem(item, { pickSelection, setPlacePaletteKey }) {
    if (item.paletteKey != null && setPlacePaletteKey != null) setPlacePaletteKey(item.paletteKey);
    pickSelection(item.select);
}
export function removeSceneItem(session, item, pickSelection) {
    DELETE_BY_SELECT_KIND[item.select.kind](session, item, pickSelection);
}
