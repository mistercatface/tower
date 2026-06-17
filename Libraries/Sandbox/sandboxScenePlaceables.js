/** Scene-list placeable kinds — one handler table for match, select, and delete dispatch. */
const floorCellPlaceable = {
    matches(selection, item) {
        return selection?.kind === "floor" && selection.col === item.col && selection.row === item.row;
    },
    selectInput(item) {
        return { kind: "floor", col: item.col, row: item.row };
    },
    delete(session, item, pickSelection) {
        pickSelection({ kind: "floor", col: item.col, row: item.row });
        session.deleteSelectedFloorCell();
    },
};
const railEdgePlaceable = {
    matches(selection, item) {
        return selection?.kind === "rail" && selection.col === item.col && selection.row === item.row && selection.side === item.side;
    },
    selectInput(item) {
        return { kind: "rail", col: item.col, row: item.row, side: item.side };
    },
    paletteKey(item) {
        return `wall:${item.kind === "rail" ? "rail" : "forcefield"}`;
    },
    delete(session, item, pickSelection) {
        pickSelection({ kind: "rail", col: item.col, row: item.row, side: item.side });
        session.deleteSelectedWall();
    },
};
const SCENE_PLACEABLE_BY_KIND = {
    prop: {
        matches(selection, item) {
            return selection?.kind === "prop" && selection.ids.has(item.propId);
        },
        selectInput(item) {
            return { kind: "prop", ids: [item.propId] };
        },
        paletteKey(item) {
            return `prop:${item.propType}`;
        },
        delete(session, item) {
            session.deletePropById(item.propId);
        },
    },
    roomNode: {
        matches(selection, item) {
            return selection?.kind === "roomNode" && selection.id === item.roomNodeId;
        },
        selectInput(item) {
            return { kind: "roomNode", id: item.roomNodeId };
        },
        delete(session, item, pickSelection) {
            pickSelection({ kind: "roomNode", id: item.roomNodeId });
            session.deleteSelectedRoomNode();
        },
    },
    roomLink: {
        matches(selection, item) {
            return selection?.kind === "roomLink" && selection.linkId === item.roomLinkId && selection.corridorIndex === (item.corridorIndex ?? 0);
        },
        selectInput(item) {
            return { kind: "roomLink", linkId: item.roomLinkId, corridorIndex: item.corridorIndex ?? 0, nodeId: null };
        },
        delete(session, item, pickSelection) {
            pickSelection({ kind: "roomLink", linkId: item.roomLinkId, corridorIndex: item.corridorIndex ?? 0 });
            session.deleteSelectedRoomLink();
        },
    },
    floorBelt: floorCellPlaceable,
    powerSource: floorCellPlaceable,
    voxel: {
        matches(selection, item) {
            return selection?.kind === "voxel" && selection.col === item.col && selection.row === item.row;
        },
        selectInput(item) {
            return { kind: "voxel", col: item.col, row: item.row };
        },
        paletteKey() {
            return "wall:voxel";
        },
        delete(session, item, pickSelection) {
            pickSelection({ kind: "voxel", col: item.col, row: item.row });
            session.deleteSelectedWall();
        },
    },
    rail: railEdgePlaceable,
    forcefield: railEdgePlaceable,
};
function scenePlaceableHandler(item) {
    return SCENE_PLACEABLE_BY_KIND[item.kind];
}
export function matchesScenePlaceable(selection, item) {
    const handler = scenePlaceableHandler(item);
    return handler ? handler.matches(selection, item) : false;
}
export function selectScenePlaceable(item, { pickSelection, setPlacePaletteKey }) {
    const handler = scenePlaceableHandler(item);
    const paletteKey = handler.paletteKey?.(item);
    if (paletteKey != null) setPlacePaletteKey(paletteKey);
    pickSelection(handler.selectInput(item));
}
export function deleteScenePlaceable(session, item, pickSelection) {
    scenePlaceableHandler(item).delete(session, item, pickSelection);
}
