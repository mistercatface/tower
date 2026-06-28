import { collectCorridorPathPointCells } from "../Pathfinding/Corridor/corridorFootprint.js";
import { buildRoomFootprintMaskForLayout, cellInsideAnyRoom } from "../Pathfinding/Corridor/corridorWalkGrid.js";
import { gridSideFromCellToNeighbor, resolveRailedBeltFromSides, unrailedBeltKindFromRailed } from "../Spatial/grid/FloorCell.js";
import { gridSideNeighborCell, layoutAbsCellIndex } from "../Spatial/grid/GridUtils.js";
/** @typedef {import("./roomGraphClosedRooms.js").Cell} Cell */
/** @typedef {import("./roomGraphClosedRooms.js").GraphNode} GraphNode */
/** @typedef {{ col: number, row: number, kind: number, facingIndex: number }} BakedFloorBelt */
/** @typedef {{ c: number, r: number, side: number }} WallHole */
/** @typedef {import("../Spatial/grid/GridUtils.js").CellIndexLayout} CellIndexLayout */
function oppositeSide(side) {
    return (side + 2) % 4;
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
/** @param {Cell[]|number[]} path @param {CellIndexLayout} layout */
export function collapsePathRevisits(path, layout) {
    const out = [];
    const indexByKey = new Map();
    for (let i = 0; i < path.length; i++) {
        const p = path[i];
        const key = typeof p === "number" ? p : layoutAbsCellIndex(layout, p.c, p.r);
        if (indexByKey.has(key)) out.length = indexByKey.get(key);
        indexByKey.set(key, out.length);
        out.push(p);
    }
    return out;
}
/** @param {Cell[]|number[]} path @param {number} width @param {Uint8Array} roomFootprintMask @param {WallHole | null} parentAnchor @param {WallHole | null} childAnchor @param {CellIndexLayout} layout @returns {Map<number, BakedFloorBelt>} */
export function beltsForPathPolyline(path, width, roomFootprintMask, parentAnchor, childAnchor, layout) {
    const collapsed = collapsePathRevisits(path, layout);
    const byCell = new Map();
    const stride = layout.strideCols;
    for (let i = 0; i < collapsed.length; i++) {
        let p, prev, next;
        if (typeof collapsed[i] === "number") {
            const pIdx = collapsed[i];
            p = { c: (pIdx % stride) + layout.originCol, r: ((pIdx / stride) | 0) + layout.originRow };
            prev = i > 0 ? { c: (collapsed[i - 1] % stride) + layout.originCol, r: ((collapsed[i - 1] / stride) | 0) + layout.originRow } : null;
            next = i < collapsed.length - 1 ? { c: (collapsed[i + 1] % stride) + layout.originCol, r: ((collapsed[i + 1] / stride) | 0) + layout.originRow } : null;
        } else {
            p = collapsed[i];
            prev = i > 0 ? collapsed[i - 1] : null;
            next = i < collapsed.length - 1 ? collapsed[i + 1] : null;
        }
        if (prev && p.c === prev.c && p.r === prev.r) continue;
        const cells = collectCorridorPathPointCells(p, prev, next, width, false, i, collapsed.length, layout);
        let spec;
        if (prev && next) {
            const entrySide = gridSideFromCellToNeighbor(p.c, p.r, prev.c, prev.r);
            const exitSide = gridSideFromCellToNeighbor(p.c, p.r, next.c, next.r);
            spec = resolveRailedBeltFromSides(entrySide, exitSide);
        } else if (next) {
            const exitSide = gridSideFromCellToNeighbor(p.c, p.r, next.c, next.r);
            const entrySide = parentAnchor ? oppositeSide(parentAnchor.side) : (exitSide + 2) % 4;
            spec = resolveRailedBeltFromSides(entrySide, exitSide);
        } else if (prev) {
            const entrySide = gridSideFromCellToNeighbor(p.c, p.r, prev.c, prev.r);
            const exitSide = childAnchor ? oppositeSide(childAnchor.side) : (entrySide + 2) % 4;
            spec = resolveRailedBeltFromSides(entrySide, exitSide);
        } else spec = resolveRailedBeltFromSides(3, 1);
        for (let ci = 0; ci < cells.length; ci++) {
            const cell = cells[ci];
            const idx = layoutAbsCellIndex(layout, cell.c, cell.r);
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
 */
export function buildCorridorBeltsFromPaths(paths, corridorWidths, rooms, parentAnchors, childAnchors, layout, { openBeltChance = 0, rng = Math.random } = {}) {
    const roomFootprintMask = buildRoomFootprintMaskForLayout(layout, rooms);
    const byCell = new Map();
    for (let pi = 0; pi < paths.length; pi++) {
        const laneBelts = beltsForPathPolyline(paths[pi], corridorWidths[pi], roomFootprintMask, parentAnchors?.[pi] ?? null, childAnchors?.[pi] ?? null, layout);
        for (const [key, belt] of laneBelts) {
            const kind = openBeltChance > 0 && rng() < openBeltChance ? unrailedBeltKindFromRailed(belt.kind) : belt.kind;
            byCell.set(key, { ...belt, kind });
        }
    }
    return [...byCell.values()].map((belt) => ({ idx: belt.idx, kind: belt.kind, facingIndex: belt.facingIndex }));
}
