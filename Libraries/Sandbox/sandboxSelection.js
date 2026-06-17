/** @param {{ isLiveProp: (id: number) => boolean, getRoomLink?: (linkId: number) => { a: number, b: number } | null }} deps */
export function createSandboxSelection({ isLiveProp, getRoomLink }) {
    /** @type {SandboxSelection | null} */
    let selection = null;

    const syncPrimaryPropId = (ids) => {
        for (const id of ids)
            if (isLiveProp(id)) return id;
        return null;
    };

    /** @param {SandboxSelection | null} next */
    const assign = (next) => {
        selection = next;
    };

    /** @param {SandboxSelectInput | null} input */
    const select = (input) => {
        if (input == null) {
            assign(null);
            return;
        }
        if (input.kind === "prop") {
            const ids = new Set();
            for (let i = 0; i < input.ids.length; i++) {
                const id = input.ids[i];
                if (isLiveProp(id)) ids.add(id);
            }
            assign(ids.size === 0 ? null : { kind: "prop", ids });
            return;
        }
        if (input.kind === "floor") {
            assign({ kind: "floor", col: input.col, row: input.row });
            return;
        }
        if (input.kind === "voxel") {
            assign({ kind: "voxel", col: input.col, row: input.row });
            return;
        }
        if (input.kind === "rail") {
            assign({ kind: "rail", col: input.col, row: input.row, side: input.side });
            return;
        }
        if (input.kind === "roomNode") {
            assign({ kind: "roomNode", id: input.id });
            return;
        }
        if (input.kind === "roomLink") {
            let nodeId = input.nodeId ?? null;
            if (input.linkId != null && nodeId != null && getRoomLink) {
                const link = getRoomLink(input.linkId);
                if (link && link.a !== nodeId && link.b !== nodeId) nodeId = null;
            }
            assign({
                kind: "roomLink",
                linkId: input.linkId,
                corridorIndex: input.linkId == null ? 0 : (input.corridorIndex ?? 0),
                nodeId,
            });
        }
    };

    const clearSelection = () => {
        assign(null);
    };

    const clearPropSelection = () => {
        if (selection?.kind === "prop") assign(null);
    };

    const clearFloorSelection = () => {
        if (selection?.kind === "floor") assign(null);
    };

    const clearWallSelection = () => {
        if (selection?.kind === "voxel" || selection?.kind === "rail") assign(null);
    };

    const clearRoomGraphSelection = () => {
        if (selection?.kind === "roomNode" || selection?.kind === "roomLink") assign(null);
    };

    const clearPalettePlaceSelection = (paletteKey) => {
        if (paletteKey.startsWith("wall:")) {
            if (selection?.kind === "prop" || selection?.kind === "floor") assign(null);
            return;
        }
        if (paletteKey.startsWith("prop:")) {
            clearWallSelection();
            return;
        }
        if (paletteKey.startsWith("gen:")) {
            if (selection?.kind === "prop" || selection?.kind === "floor" || selection?.kind === "voxel" || selection?.kind === "rail") assign(null);
        }
    };

    const primaryPropId = () => {
        if (selection?.kind !== "prop") return null;
        for (const id of selection.ids)
            if (isLiveProp(id)) return id;
        return null;
    };

    const prunePropSelection = () => {
        if (selection?.kind !== "prop") return false;
        let changed = false;
        for (const id of selection.ids)
            if (!isLiveProp(id)) {
                selection.ids.delete(id);
                changed = true;
            }
        if (!changed) return false;
        if (selection.ids.size === 0) assign(null);
        return true;
    };

    const removePropFromSelection = (propId) => {
        if (selection?.kind !== "prop" || !selection.ids.delete(propId)) return false;
        if (selection.ids.size === 0) assign(null);
        return true;
    };

    const clearDeletedPropSelection = () => {
        clearPropSelection();
    };

    const dropDeletedWallSelection = (col, row, side = null) => {
        if (selection?.kind === "voxel" && selection.col === col && selection.row === row) {
            assign(null);
            return;
        }
        if (selection?.kind === "rail" && selection.col === col && selection.row === row && (side == null || selection.side === side)) assign(null);
    };

    const dropDeletedRoomLinkSelection = (linkId) => {
        if (selection?.kind === "roomLink" && selection.linkId === linkId) {
            if (selection.nodeId != null) assign({ kind: "roomNode", id: selection.nodeId });
            else assign(null);
        }
    };

    const dropRoomGraphIfLinkMissing = (linkExists) => {
        if (selection?.kind === "roomLink" && selection.linkId != null && !linkExists(selection.linkId)) clearRoomGraphSelection();
    };

    const clampRoomLinkCorridorIndex = (laneCount) => {
        if (selection?.kind !== "roomLink" || selection.linkId == null) return;
        selection.corridorIndex = Math.min(selection.corridorIndex, laneCount - 1);
    };

    const clearRoomLinkAfterDelete = () => {
        if (selection?.kind !== "roomLink" || selection.linkId == null) return;
        if (selection.nodeId != null) assign({ kind: "roomNode", id: selection.nodeId });
        else assign(null);
    };

    return {
        getSelection: () => selection,
        select,
        clearSelection,
        clearPropSelection,
        clearFloorSelection,
        clearWallSelection,
        clearRoomGraphSelection,
        clearPalettePlaceSelection,
        prunePropSelection,
        removePropFromSelection,
        clearDeletedPropSelection,
        dropDeletedWallSelection,
        dropDeletedRoomLinkSelection,
        dropRoomGraphIfLinkMissing,
        clampRoomLinkCorridorIndex,
        clearRoomLinkAfterDelete,
        getSelectedPropIds: () => (selection?.kind === "prop" ? [...selection.ids] : []),
        getSelectedPropId: () => primaryPropId(),
        getSelectedFloorCell: () => (selection?.kind === "floor" ? { col: selection.col, row: selection.row } : null),
        getSelectedVoxelCell: () => (selection?.kind === "voxel" ? { col: selection.col, row: selection.row } : null),
        getSelectedRailEdge: () => (selection?.kind === "rail" ? { col: selection.col, row: selection.row, side: selection.side } : null),
        getSelectedRoomNodeId: () => {
            if (selection?.kind === "roomNode") return selection.id;
            if (selection?.kind === "roomLink") return selection.nodeId;
            return null;
        },
        getSelectedRoomLinkId: () => (selection?.kind === "roomLink" ? selection.linkId : null),
        getSelectedRoomLinkCorridorIndex: () => (selection?.kind === "roomLink" ? selection.corridorIndex : 0),
        hasSelectedProp: (propId) => selection?.kind === "prop" && selection.ids.has(propId),
        matchesSceneItem(item) {
            if (item.kind === "prop") return selection?.kind === "prop" && selection.ids.has(item.propId);
            if (item.kind === "roomNode") return selection?.kind === "roomNode" && selection.id === item.roomNodeId;
            if (item.kind === "roomLink")
                return selection?.kind === "roomLink" && selection.linkId === item.roomLinkId && selection.corridorIndex === (item.corridorIndex ?? 0);
            if (item.kind === "floorBelt" || item.kind === "powerSource")
                return selection?.kind === "floor" && selection.col === item.col && selection.row === item.row;
            if (item.kind === "voxel") return selection?.kind === "voxel" && selection.col === item.col && selection.row === item.row;
            return selection?.kind === "rail" && selection.col === item.col && selection.row === item.row && selection.side === item.side;
        },
    };
}

/** @typedef {{ kind: 'prop', ids: Set<number> } | { kind: 'floor', col: number, row: number } | { kind: 'voxel', col: number, row: number } | { kind: 'rail', col: number, row: number, side: number } | { kind: 'roomNode', id: number } | { kind: 'roomLink', linkId: number | null, corridorIndex: number, nodeId: number | null }} SandboxSelection */

/** @typedef {{ kind: 'prop', ids: number[] } | { kind: 'floor', col: number, row: number } | { kind: 'voxel', col: number, row: number } | { kind: 'rail', col: number, row: number, side: number } | { kind: 'roomNode', id: number } | { kind: 'roomLink', linkId: number | null, corridorIndex?: number, nodeId?: number | null }} SandboxSelectInput */
