import { formatSandboxFactionLabel, resolveSandboxFaction } from "../Combat/sandboxTargeting.js";
import { formatPropTypeLabel } from "../Props/PropCatalog.js";
import {
    addRoomLink,
    clearRoomLinksForNode,
    formatRoomNodeLabel,
    getRoomLink,
    getRoomNode,
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
import { invalidateRoomLinkFloorSurface, invalidateRoomNodeFloorSurface } from "../RoomGraph/roomGraphSurfaceProfile.js";
import { listPlacedForcefields, listPlacedRailWalls, listPlacedVoxelWalls } from "./gridWallEdit.js";
import { selectScenePlaceable } from "./sandboxScenePlaceables.js";
import { selectionRoomLinkId, selectionRoomNodeId, resolveSelectedRoomNode } from "./sandboxSelectionInspectors.js";
export function createSandboxRoomGraphSession(
    state,
    {
        selection,
        pickSelection,
        notifyUi,
        placement,
        clampAuthoredRailWallHeight,
        clampAuthoredRailWallThickness,
        setPlacePaletteKey,
        listPlacedProps,
        listPlacedFloorBelts,
        listPlacedPassagePowerSources,
    },
) {
    const sel = () => selection.getSelection();
    return {
        pickRoomNodeAtWorld(worldX, worldY) {
            const grid = state.obstacleGrid;
            const { col, row } = grid.worldToGrid(worldX, worldY);
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
            const profileOnly =
                patch.surfaceProfileId !== undefined && !needsReroll && patch.corridorType == null && patch.railWallHeightLevel == null && patch.railWallThicknessLevel == null && patch.seed == null;
            if (!needsReroll && !profileOnly) syncRoomGraphBake(state);
            if (profileOnly) invalidateRoomLinkFloorSurface(state, linkId);
            notifyUi();
            return true;
        },
        updateSelectedRoomNode(patch) {
            const nodeId = selectionRoomNodeId(sel());
            if (nodeId == null) return false;
            if (patch.railWallHeightLevel != null) patch = { ...patch, railWallHeightLevel: clampAuthoredRailWallHeight(patch.railWallHeightLevel) };
            if (patch.railWallThicknessLevel != null) patch = { ...patch, railWallThicknessLevel: clampAuthoredRailWallThickness(patch.railWallThicknessLevel) };
            if (!updateRoomNode(state, nodeId, patch)) return false;
            const profileOnly = patch.surfaceProfileId !== undefined && patch.railWallHeightLevel == null && patch.railWallThicknessLevel == null;
            if (profileOnly) invalidateRoomNodeFloorSurface(state, getRoomNode(state, nodeId));
            else syncRoomGraphBake(state);
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
            for (const entry of listPlacedPassagePowerSources()) placement.touchFloorPlacement(entry.col, entry.row);
            for (const entry of listPlacedVoxelWalls(state.obstacleGrid)) placement.touchVoxelPlacement(entry.col, entry.row);
            for (const entry of listPlacedRailWalls(state.obstacleGrid)) placement.touchEdgePlacement("rail", entry.col, entry.row, entry.side);
            for (const entry of listPlacedForcefields(state.obstacleGrid)) placement.touchEdgePlacement("forcefield", entry.col, entry.row, entry.side);
            for (const entry of this.listPlacedRoomNodes()) placement.touchRoomNodePlacement(entry.id);
            for (const entry of this.listPlacedRoomLinks()) placement.touchRoomLinkPlacement(entry.linkId, entry.corridorIndex);
        },
        listPlacedSceneItems() {
            const items = [];
            for (const entry of listPlacedProps())
                items.push({
                    seq: placement.placementSeq(placement.propPlacementKey(entry.id), entry.id),
                    kind: "prop",
                    label: `${entry.label} · ${formatSandboxFactionLabel(entry.faction)}`,
                    propId: entry.id,
                    propType: entry.type,
                });
            for (const entry of listPlacedFloorBelts())
                items.push({
                    seq: placement.placementSeq(placement.floorPlacementKey(entry.col, entry.row), 1e9 + entry.col + entry.row * 1e6),
                    kind: "floorBelt",
                    label: entry.label,
                    col: entry.col,
                    row: entry.row,
                });
            for (const entry of listPlacedPassagePowerSources())
                items.push({
                    seq: placement.placementSeq(placement.floorPlacementKey(entry.col, entry.row), 2e9 + entry.col + entry.row * 1e6),
                    kind: "powerSource",
                    label: entry.label,
                    col: entry.col,
                    row: entry.row,
                });
            for (const entry of placement.listTrackedVoxelWalls())
                items.push({
                    seq: placement.placementSeq(placement.voxelPlacementKey(entry.col, entry.row), 3e9 + entry.col + entry.row * 1e6),
                    kind: "voxel",
                    label: entry.label,
                    col: entry.col,
                    row: entry.row,
                });
            for (const entry of placement.listTrackedRailWalls())
                items.push({
                    seq: placement.placementSeq(placement.edgePlacementKey("rail", entry.col, entry.row, entry.side), 4e9 + entry.col + entry.row * 1e6 + entry.side),
                    kind: "rail",
                    label: entry.label,
                    col: entry.col,
                    row: entry.row,
                    side: entry.side,
                });
            for (const entry of listPlacedForcefields(state.obstacleGrid))
                items.push({
                    seq: placement.placementSeq(placement.edgePlacementKey("forcefield", entry.col, entry.row, entry.side), 5e9 + entry.col + entry.row * 1e6 + entry.side),
                    kind: "forcefield",
                    label: entry.label,
                    col: entry.col,
                    row: entry.row,
                    side: entry.side,
                });
            for (const entry of this.listPlacedRoomNodes())
                items.push({ seq: placement.placementSeq(placement.roomNodePlacementKey(entry.id), 7e9 + entry.id), kind: "roomNode", label: entry.label, roomNodeId: entry.id });
            for (const entry of this.listPlacedRoomLinks())
                items.push({
                    seq: placement.placementSeq(placement.roomLinkPlacementKey(entry.linkId, entry.corridorIndex), 8e9 + entry.linkId + entry.corridorIndex * 1e6),
                    kind: "roomLink",
                    label: entry.label,
                    roomLinkId: entry.linkId,
                    corridorIndex: entry.corridorIndex,
                });
            items.sort((a, b) => a.seq - b.seq);
            return items;
        },
        isSceneItemSelected(item) {
            return selection.matchesSceneItem(item);
        },
        selectSceneItem(item) {
            selectScenePlaceable(item, { pickSelection, setPlacePaletteKey });
        },
    };
}
