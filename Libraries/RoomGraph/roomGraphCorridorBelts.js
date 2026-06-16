import { collectCorridorPathPointCells } from "../Pathfinding/Corridor/corridorFootprint.js";
import { cellInsideAnyRoom } from "../Pathfinding/Corridor/corridorWalkGrid.js";
import { gridSideFromCellToNeighbor, resolveRailedBeltFromSides } from "../Spatial/grid/FloorCell.js";
import { gridSideNeighborCell } from "../Spatial/grid/GridUtils.js";
/** @typedef {import("./roomGraphClosedRooms.js").Cell} Cell */
/** @typedef {import("./roomGraphClosedRooms.js").GraphNode} GraphNode */
/** @typedef {{ col: number, row: number, kind: number, facingIndex: number }} BakedFloorBelt */
/** @typedef {{ c: number, r: number, side: number }} WallHole */
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
/** @param {Cell[]} path */
export function collapsePathRevisits(path) {
    const out = [];
    const indexByKey = new Map();
    for (let i = 0; i < path.length; i++) {
        const p = path[i];
        const key = `${p.c},${p.r}`;
        if (indexByKey.has(key)) out.length = indexByKey.get(key);
        indexByKey.set(key, out.length);
        out.push({ c: p.c, r: p.r });
    }
    return out;
}
/** @param {Cell[]} path @param {number} width @param {GraphNode[]} rooms @param {WallHole | null} parentAnchor @param {WallHole | null} childAnchor @returns {Map<string, BakedFloorBelt>} */
function beltsForCollapsedPath(path, width, rooms, parentAnchor, childAnchor) {
    const collapsed = collapsePathRevisits(path);
    const byCell = new Map();
    for (let i = 0; i < collapsed.length; i++) {
        if (i > 0 && collapsed[i].c === collapsed[i - 1].c && collapsed[i].r === collapsed[i - 1].r) continue;
        const prev = i > 0 ? collapsed[i - 1] : null;
        const next = i < collapsed.length - 1 ? collapsed[i + 1] : null;
        const cells = collectCorridorPathPointCells(collapsed[i], prev, next, width, false, i, collapsed.length);
        let spec;
        if (prev && next) {
            const entrySide = gridSideFromCellToNeighbor(collapsed[i].c, collapsed[i].r, prev.c, prev.r);
            const exitSide = gridSideFromCellToNeighbor(collapsed[i].c, collapsed[i].r, next.c, next.r);
            spec = resolveRailedBeltFromSides(entrySide, exitSide);
        } else if (next) {
            const exitSide = gridSideFromCellToNeighbor(collapsed[i].c, collapsed[i].r, next.c, next.r);
            const entrySide = parentAnchor ? oppositeSide(parentAnchor.side) : (exitSide + 2) % 4;
            spec = resolveRailedBeltFromSides(entrySide, exitSide);
        } else if (prev) {
            const entrySide = gridSideFromCellToNeighbor(collapsed[i].c, collapsed[i].r, prev.c, prev.r);
            const exitSide = childAnchor ? oppositeSide(childAnchor.side) : (entrySide + 2) % 4;
            spec = resolveRailedBeltFromSides(entrySide, exitSide);
        } else spec = resolveRailedBeltFromSides(3, 1);
        for (let ci = 0; ci < cells.length; ci++) {
            const cell = cells[ci];
            if (cellInsideAnyRoom(rooms, cell.c, cell.r)) continue;
            byCell.set(`${cell.c},${cell.r}`, { col: cell.c, row: cell.r, kind: spec.kind, facingIndex: spec.facingIndex });
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
 */
export function buildCorridorBeltsFromPaths(paths, corridorWidths, rooms, parentAnchors, childAnchors) {
    const byCell = new Map();
    for (let pi = 0; pi < paths.length; pi++) {
        const laneBelts = beltsForCollapsedPath(paths[pi], corridorWidths[pi], rooms, parentAnchors?.[pi] ?? null, childAnchors?.[pi] ?? null);
        for (const [key, belt] of laneBelts) byCell.set(key, belt);
    }
    return [...byCell.values()];
}
