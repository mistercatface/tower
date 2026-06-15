import { CARDINAL_OFFSETS } from "../Spatial/grid/GridUtils.js";
import { collectCorridorPathPointCells } from "../Pathfinding/Corridor/corridorFootprint.js";
import { cellInsideAnyRoom } from "../Pathfinding/Corridor/corridorWalkGrid.js";
import { gridSideFromCellToNeighbor, resolveRailedBeltFromSides } from "../Spatial/grid/FloorCell.js";

/** @typedef {import("./roomGraphClosedRooms.js").Cell} Cell */
/** @typedef {import("./roomGraphClosedRooms.js").GraphNode} GraphNode */
/** @typedef {{ col: number, row: number, kind: number, facingIndex: number }} BakedFloorBelt */

/** @param {Cell[]} path @param {number} width @returns {Map<string, number>} */
function pathFootprintSteps(path, width) {
    /** @type {Map<string, number>} */
    const step = new Map();
    for (let i = 0; i < path.length; i++) {
        if (i > 0 && path[i].c === path[i - 1].c && path[i].r === path[i - 1].r) continue;
        const cells = collectCorridorPathPointCells(path[i], path[i - 1], path[i + 1], width, false, i, path.length);
        for (let ci = 0; ci < cells.length; ci++) {
            const key = `${cells[ci].c},${cells[ci].r}`;
            const prev = step.get(key);
            if (prev == null || i < prev) step.set(key, i);
        }
    }
    return step;
}

/**
 * @param {number} c
 * @param {number} r
 * @param {Map<string, number>} step
 * @param {Set<string>} footprint
 */
function beltSpecForFootprintCell(c, r, step, footprint) {
    const myStep = step.get(`${c},${r}`);
    /** @type {{ c: number, r: number, step: number } | null} */
    let prev = null;
    /** @type {{ c: number, r: number, step: number } | null} */
    let next = null;
    for (let si = 0; si < CARDINAL_OFFSETS.length; si++) {
        const nc = c + CARDINAL_OFFSETS[si].dc;
        const nr = r + CARDINAL_OFFSETS[si].dr;
        const key = `${nc},${nr}`;
        if (!footprint.has(key)) continue;
        const nStep = step.get(key);
        if (nStep < myStep && (prev == null || nStep > prev.step)) prev = { c: nc, r: nr, step: nStep };
        if (nStep > myStep && (next == null || nStep < next.step)) next = { c: nc, r: nr, step: nStep };
    }
    if (prev && next) {
        const entrySide = gridSideFromCellToNeighbor(c, r, prev.c, prev.r);
        const exitSide = gridSideFromCellToNeighbor(c, r, next.c, next.r);
        return resolveRailedBeltFromSides(entrySide, exitSide);
    }
    if (next) {
        const exitSide = gridSideFromCellToNeighbor(c, r, next.c, next.r);
        return resolveRailedBeltFromSides((exitSide + 2) % 4, exitSide);
    }
    if (prev) {
        const entrySide = gridSideFromCellToNeighbor(c, r, prev.c, prev.r);
        return resolveRailedBeltFromSides(entrySide, (entrySide + 2) % 4);
    }
    return resolveRailedBeltFromSides(3, 1);
}

/**
 * Belt flow follows path order: link.a room → link.b room (wire pick order).
 * @param {Cell[][]} paths
 * @param {number[]} corridorWidths
 * @param {GraphNode[]} rooms
 */
export function buildCorridorBeltsFromPaths(paths, corridorWidths, rooms) {
    /** @type {Map<string, number>} */
    const step = new Map();
    /** @type {Set<string>} */
    const footprint = new Set();
    for (let pi = 0; pi < paths.length; pi++) {
        const pathSteps = pathFootprintSteps(paths[pi], corridorWidths[pi]);
        for (const [key, pathStep] of pathSteps) {
            footprint.add(key);
            const composite = pi * 100000 + pathStep;
            const prev = step.get(key);
            if (prev == null || composite < prev) step.set(key, composite);
        }
    }
    /** @type {Map<string, BakedFloorBelt>} */
    const byCell = new Map();
    for (const key of footprint) {
        const comma = key.indexOf(",");
        const c = Number(key.slice(0, comma));
        const r = Number(key.slice(comma + 1));
        if (cellInsideAnyRoom(rooms, c, r)) continue;
        const spec = beltSpecForFootprintCell(c, r, step, footprint);
        byCell.set(key, { col: c, row: r, kind: spec.kind, facingIndex: spec.facingIndex });
    }
    return [...byCell.values()];
}
