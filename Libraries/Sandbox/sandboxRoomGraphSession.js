import {
    addRoomLink,
    clearRoomLinksForNode,
    formatRoomNodeLabel,
    getRoomLink,
    listRoomLinks,
    listRoomLinkCorridorSceneEntries,
    listRoomNodeCorridorEntries,
    listRoomNodes,
    pickRoomNodeAt,
    removeRoomLink,
    removeRoomNode,
    rerollRoomLinkBake,
    roomLinkCorridorLaneCount,
    syncRoomGraphBake,
    updateRoomLink,
    updateRoomNode,
} from "../RoomGraph/index.js";
import { listPlacedRailWalls, listPlacedVoxelWalls } from "./gridWallEdit.js";
import { listPlacedSceneItems, matchesSceneItem, pickSceneItem } from "./sandboxScenePlaceables.js";
import { selectionRoomLinkId, selectionRoomNodeId, resolveSelectedRoomNode } from "./sandboxSelectionInspectors.js";
export function createSandboxRoomGraphSession(
    state,
    { selection, pickSelection, notifyUi, placement, clampAuthoredRailWallHeight, clampAuthoredRailWallThickness, setPlacePaletteKey, listPlacedProps, listPlacedFloorBelts },
) {
    const sel = () => selection.getSelection();
    return {
        pickRoomNodeAtWorld(worldX, worldY) {
            const grid = state.obstacleGrid;
            const col = grid.worldCol(worldX);
            const row = grid.worldRow(worldY);
            const node = pickRoomNodeAt(state, col, row);
            if (!node) return false;
            pickSelection({ kind: "roomNode", id: node.id });
            return true;
        },
        addRoomLinkBetweenNodes(a, b, options = {}) {
            const link = addRoomLink(state, a, b, options);
            if (!link) return null;
            placement.touchRoomLinkCorridors(link);
            syncRoomGraphBake(state);
            notifyUi();
            return link;
        },
        removeRoomLinkById(linkId) {
            if (!removeRoomLink(state, linkId)) return false;
            placement.forgetRoomLinkPlacement(linkId);
            selection.dropDeletedRoomLinkSelection(linkId);
            syncRoomGraphBake(state);
            notifyUi();
            return true;
        },
        clearSelectedRoomNodeLinks() {
            const node = resolveSelectedRoomNode(state, sel());
            if (!node) return;
            const links = listRoomLinks(state).filter((link) => link.a === node.id || link.b === node.id);
            clearRoomLinksForNode(state, node.id);
            for (let i = 0; i < links.length; i++) placement.forgetRoomLinkPlacement(links[i].id);
            selection.dropRoomGraphIfLinkMissing((id) => !!getRoomLink(state, id));
            syncRoomGraphBake(state);
            notifyUi();
        },
        listSelectedRoomNodeLinks() {
            const node = resolveSelectedRoomNode(state, sel());
            if (!node) return [];
            return listRoomNodeCorridorEntries(state, node.id).map((entry) => ({ linkId: entry.link.id, corridorIndex: entry.corridorIndex, label: entry.label }));
        },
        deleteSelectedRoomNode() {
            const nodeId = selectionRoomNodeId(sel());
            if (nodeId == null) return;
            const links = listRoomLinks(state).filter((link) => link.a === nodeId || link.b === nodeId);
            removeRoomNode(state, nodeId);
            placement.forgetRoomNodePlacement(nodeId);
            for (let i = 0; i < links.length; i++) placement.forgetRoomLinkPlacement(links[i].id);
            selection.clearRoomGraphSelection();
            syncRoomGraphBake(state);
            notifyUi();
        },
        deleteSelectedRoomLink() {
            const linkId = selectionRoomLinkId(sel());
            if (linkId == null) return;
            placement.forgetRoomLinkPlacement(linkId);
            removeRoomLink(state, linkId);
            selection.clearRoomLinkAfterDelete();
            syncRoomGraphBake(state);
            notifyUi();
        },
        updateSelectedRoomLink(patch) {
            const linkId = selectionRoomLinkId(sel());
            if (linkId == null) return false;
            if (patch.railWallHeightLevel != null) patch = { ...patch, railWallHeightLevel: clampAuthoredRailWallHeight(patch.railWallHeightLevel) };
            if (patch.railWallThicknessLevel != null) patch = { ...patch, railWallThicknessLevel: clampAuthoredRailWallThickness(patch.railWallThicknessLevel) };
            if (!updateRoomLink(state, linkId, patch)) return false;
            const link = getRoomLink(state, linkId);
            if (link) {
                selection.clampRoomLinkCorridorIndex(roomLinkCorridorLaneCount(link));
                if (patch.corridorCount != null) placement.touchRoomLinkCorridors(link);
            }
            const needsReroll = patch.corridorCount != null || patch.corridorWidthMin != null || patch.corridorWidthMax != null;
            if (!needsReroll) syncRoomGraphBake(state);
            notifyUi();
            return true;
        },
        updateSelectedRoomNode(patch) {
            const nodeId = selectionRoomNodeId(sel());
            if (nodeId == null) return false;
            if (patch.railWallHeightLevel != null) patch = { ...patch, railWallHeightLevel: clampAuthoredRailWallHeight(patch.railWallHeightLevel) };
            if (patch.railWallThicknessLevel != null) patch = { ...patch, railWallThicknessLevel: clampAuthoredRailWallThickness(patch.railWallThicknessLevel) };
            if (!updateRoomNode(state, nodeId, patch)) return false;
            syncRoomGraphBake(state);
            notifyUi();
            return true;
        },
        rerollSelectedRoomLink() {
            const linkId = selectionRoomLinkId(sel());
            if (linkId == null) return;
            rerollRoomLinkBake(state, linkId);
            notifyUi();
        },
        listPlacedRoomNodes() {
            return listRoomNodes(state).map((node) => ({ id: node.id, col: node.col, row: node.row, width: node.width, height: node.height, label: formatRoomNodeLabel(node) }));
        },
        listPlacedRoomLinks() {
            return listRoomLinkCorridorSceneEntries(state);
        },
        seedPlacementOrderFromState() {
            placement.resetPlacementOrder();
            const props = listPlacedProps().sort((a, b) => a.id - b.id);
            for (let i = 0; i < props.length; i++) placement.touchPropPlacement(props[i].id);
            for (const entry of listPlacedFloorBelts()) placement.touchFloorPlacement(entry.col, entry.row);
            for (const entry of listPlacedVoxelWalls(state.obstacleGrid)) placement.touchVoxelPlacement(entry.col, entry.row);
            for (const entry of listPlacedRailWalls(state.obstacleGrid)) placement.touchEdgePlacement("rail", entry.col, entry.row, entry.side);
            for (const entry of this.listPlacedRoomNodes()) placement.touchRoomNodePlacement(entry.id);
            for (const entry of this.listPlacedRoomLinks()) placement.touchRoomLinkPlacement(entry.linkId, entry.corridorIndex);
        },
        listPlacedSceneItems() {
            return listPlacedSceneItems({
                state,
                placement,
                listPlacedProps,
                listPlacedFloorBelts,
                listPlacedRoomNodes: () => this.listPlacedRoomNodes(),
                listPlacedRoomLinks: () => this.listPlacedRoomLinks(),
            });
        },
        isSceneItemSelected(item) {
            return matchesSceneItem(selection.getSelection(), item);
        },
        selectSceneItem(item) {
            pickSceneItem(item, { pickSelection });
        },
    };
}
