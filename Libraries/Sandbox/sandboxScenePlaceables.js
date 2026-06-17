import { formatSandboxFactionLabel } from "../Combat/sandboxTargeting.js";
import { listPlacedForcefields } from "./gridWallEdit.js";
/** @typedef {{ seq: number, label: string, select: { kind: string }, paletteKey?: string }} SandboxSceneItem */
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
function sceneItem(seq, label, select, paletteKey) {
    const item = { seq, label, select };
    if (paletteKey != null) item.paletteKey = paletteKey;
    return item;
}
function listPropSceneItems({ placement, listPlacedProps }) {
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
}
function listFloorBeltSceneItems({ placement, listPlacedFloorBelts }) {
    const items = [];
    for (const entry of listPlacedFloorBelts())
        items.push(
            sceneItem(placement.placementSeq(placement.floorPlacementKey(entry.col, entry.row), 1e9 + entry.col + entry.row * 1e6), entry.label, { kind: "floor", col: entry.col, row: entry.row }),
        );
    return items;
}
function listPowerSourceSceneItems({ placement, listPlacedPassagePowerSources }) {
    const items = [];
    for (const entry of listPlacedPassagePowerSources())
        items.push(
            sceneItem(placement.placementSeq(placement.floorPlacementKey(entry.col, entry.row), 2e9 + entry.col + entry.row * 1e6), entry.label, { kind: "floor", col: entry.col, row: entry.row }),
        );
    return items;
}
function listVoxelSceneItems({ placement }) {
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
}
function listRailSceneItems({ placement }) {
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
}
function listForcefieldSceneItems({ state, placement }) {
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
}
function listRoomNodeSceneItems({ placement, listPlacedRoomNodes }) {
    const items = [];
    for (const entry of listPlacedRoomNodes()) items.push(sceneItem(placement.placementSeq(placement.roomNodePlacementKey(entry.id), 7e9 + entry.id), entry.label, { kind: "roomNode", id: entry.id }));
    return items;
}
function listRoomLinkSceneItems({ placement, listPlacedRoomLinks }) {
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
}
const SCENE_ITEM_LISTERS = [
    listPropSceneItems,
    listFloorBeltSceneItems,
    listPowerSourceSceneItems,
    listVoxelSceneItems,
    listRailSceneItems,
    listForcefieldSceneItems,
    listRoomNodeSceneItems,
    listRoomLinkSceneItems,
];
export function listPlacedSceneItems(ctx) {
    const items = [];
    for (let i = 0; i < SCENE_ITEM_LISTERS.length; i++) items.push(...SCENE_ITEM_LISTERS[i](ctx));
    items.sort((a, b) => a.seq - b.seq);
    return items;
}
export function matchesSceneItem(selection, item) {
    return selectionMatchesSelect(selection, item.select);
}
export function pickSceneItem(item, { pickSelection, setPlacePaletteKey }) {
    if (item.paletteKey != null) setPlacePaletteKey(item.paletteKey);
    pickSelection(item.select);
}
export function removeSceneItem(session, item, pickSelection) {
    DELETE_BY_SELECT_KIND[item.select.kind](session, item, pickSelection);
}
