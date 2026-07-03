import { collectCorridorPathPointIndices } from "../Pathfinding/Corridor/corridorFootprint.js";
import { buildRoomFootprintMaskForLayout, cellInsideAnyRoom } from "../Pathfinding/Corridor/corridorWalkGrid.js";
import { gridSideFromCellIdxToNeighborIdx, resolveBeltKindFromSides } from "../Spatial/grid/FloorCell.js";
import { layoutAbsCellIndex, gridSideNeighborCell } from "../Spatial/grid/GridUtils.js";
/** @typedef {import("./roomGraphClosedRooms.js").Cell} Cell */
/** @typedef {import("./roomGraphClosedRooms.js").GraphNode} GraphNode */
/** @typedef {{ col: number, row: number, kind: number, facingIndex: number }} BakedFloorBelt */
/** @typedef {{ c: number, r: number, side: number }} WallHole */
/** @typedef {import("../Spatial/grid/GridUtils.js").CellIndexLayout} CellIndexLayout */
import { edgeMirrorSide } from "../Spatial/grid/gridCellTopology.js";
function oppositeSide(side) {
    return edgeMirrorSide(side);
}
/** @param {WallHole} hole */
export function roomInteriorCellFromWallHole(hole) {
    const n = gridSideNeighborCell(hole.c, hole.r, oppositeSide(hole.side));
    return { c: n.col, r: n.row };
}
/** @param {WallHole} hole */
export function corridorExteriorCellFromWallHole(hole) {
    const n = gridSideNeighborCell(hole.c, hole.r, hole.side);
    return { c: n.col, r: n.row };
}
/** @param {number[]} path @param {CellIndexLayout} layout */
export function collapsePathRevisits(path, layout) {
    const out = [];
    const indexByKey = new Map();
    for (let i = 0; i < path.length; i++) {
        const pIdx = path[i];
        if (indexByKey.has(pIdx)) out.length = indexByKey.get(pIdx);
        indexByKey.set(pIdx, out.length);
        out.push(pIdx);
    }
    return out;
}
/** @param {number[]} path @param {number} width @param {Uint8Array} roomFootprintMask @param {WallHole | null} parentAnchor @param {WallHole | null} childAnchor @param {CellIndexLayout} layout @returns {Map<number, BakedFloorBelt>} */
export function beltsForPathPolyline(path, width, roomFootprintMask, parentAnchor, childAnchor, layout) {
    const collapsed = collapsePathRevisits(path, layout);
    const byCell = new Map();
    const stride = layout.strideCols;
    for (let i = 0; i < collapsed.length; i++) {
        const pIdx = collapsed[i];
        const prevIdx = i > 0 ? collapsed[i - 1] : undefined;
        const nextIdx = i < collapsed.length - 1 ? collapsed[i + 1] : undefined;
        if (prevIdx !== undefined && pIdx === prevIdx) continue;
        const cells = collectCorridorPathPointIndices(pIdx, prevIdx, nextIdx, width, false, i, collapsed.length, layout);
        let spec;
        if (prevIdx !== undefined && nextIdx !== undefined) {
            const entrySide = gridSideFromCellIdxToNeighborIdx(pIdx, prevIdx, stride);
            const exitSide = gridSideFromCellIdxToNeighborIdx(pIdx, nextIdx, stride);
            spec = resolveBeltKindFromSides(entrySide, exitSide);
        } else if (nextIdx !== undefined) {
            const exitSide = gridSideFromCellIdxToNeighborIdx(pIdx, nextIdx, stride);
            const entrySide = parentAnchor ? oppositeSide(parentAnchor.side) : oppositeSide(exitSide);
            spec = resolveBeltKindFromSides(entrySide, exitSide);
        } else if (prevIdx !== undefined) {
            const entrySide = gridSideFromCellIdxToNeighborIdx(pIdx, prevIdx, stride);
            const exitSide = childAnchor ? oppositeSide(childAnchor.side) : oppositeSide(entrySide);
            spec = resolveBeltKindFromSides(entrySide, exitSide);
        } else spec = resolveBeltKindFromSides(3, 1);
        for (let ci = 0; ci < cells.length; ci++) {
            const idx = cells[ci];
            if (cellInsideAnyRoom(roomFootprintMask, idx)) continue;
            byCell.set(idx, { idx, kind: spec.kind, facingIndex: spec.facingIndex });
        }
    }
    return byCell;
}
/**
 * Belt flow follows path order: link.a room → link.b room (wire pick order).
 * Belts stamp only on corridor cells outside room footprints.
 * @param {Cell[][]} paths
 * @param {number[]} corridorWidths
 * @param {GraphNode[]} rooms
 * @param {WallHole[]} [parentAnchors]
 * @param {WallHole[]} [childAnchors]
 * @param {CellIndexLayout} layout
 */ export function buildCorridorBeltsFromPaths(paths, corridorWidths, rooms, parentAnchors, childAnchors, layout) {
    const roomFootprintMask = buildRoomFootprintMaskForLayout(layout, rooms);
    const byCell = new Map();
    for (let pi = 0; pi < paths.length; pi++) {
        const laneBelts = beltsForPathPolyline(paths[pi], corridorWidths[pi], roomFootprintMask, parentAnchors?.[pi] ?? null, childAnchors?.[pi] ?? null, layout);
        for (const [key, belt] of laneBelts) byCell.set(key, belt);
    }
    return [...byCell.values()].map((belt) => ({ idx: belt.idx, kind: belt.kind, facingIndex: belt.facingIndex }));
}
