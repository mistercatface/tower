import { collectCorridorPathPointCells, collectCorridorPathPointIndices } from "../Pathfinding/Corridor/corridorFootprint.js";
import { buildRoomFootprintMaskForLayout, cellInsideAnyRoom } from "../Pathfinding/Corridor/corridorWalkGrid.js";
import { createCellIndexLayout, layoutAbsCellIndex, layoutAbsToLocalCell, layoutContainsAbsCell, layoutLocalCellIndex, layoutLocalToAbsCell } from "../Spatial/grid/GridUtils.js";
import {
    DEFAULT_RAIL_WALL_HEIGHT_LEVEL,
    DEFAULT_RAIL_WALL_THICKNESS_LEVEL,
    omitRailWallsAtGapKeys,
    resolveRailWallHeightLevel,
    resolveRailWallThicknessLevel,
    roomWallGapKeysWorld,
} from "./roomGraphClosedRooms.js";
/** @typedef {import("./roomGraphClosedRooms.js").Cell} Cell */
/** @typedef {import("./roomGraphClosedRooms.js").GraphNode} GraphNode */
/** @typedef {import("./roomGraphClosedRooms.js").RailWall} RailWall */
/** @typedef {import("./roomGraphClosedRooms.js").ClosedRoom} ClosedRoom */
export const DEFAULT_CORRIDOR_EGRESS_CELLS = 2;
/** @param {RailWall} wall */
function railWallEdgeKey(wall) {
    return `${wall.col},${wall.row},${wall.side}`;
}
/** @param {RailWall[]} rails */
function dedupeRailWallsByEdge(rails) {
    /** @type {Set<string>} */
    const seen = new Set();
    /** @type {RailWall[]} */
    const out = [];
    for (let i = 0; i < rails.length; i++) {
        const wall = rails[i];
        const key = railWallEdgeKey(wall);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(wall);
    }
    return out;
}
/** @param {Uint8Array} mask @param {{ originCol: number, originRow: number, cols: number, rows: number }} bounds @param {Cell[]} path @param {number} corridorWidth @param {Uint8Array} roomFootprintMask */
function stampCorridorTubeLocal(mask, bounds, path, corridorWidth, roomFootprintMask) {
    const layout = createCellIndexLayout(bounds.originCol, bounds.originRow, bounds.cols, bounds.rows);
    for (let i = 0; i < path.length; i++)
        if (typeof path[i] === "number") {
            const pIdx = path[i];
            const prevIdx = i > 0 ? path[i - 1] : undefined;
            const nextIdx = i + 1 < path.length ? path[i + 1] : undefined;
            const cells = collectCorridorPathPointIndices(pIdx, prevIdx, nextIdx, corridorWidth, false, i, path.length, layout);
            for (let ci = 0; ci < cells.length; ci++) {
                const idx = cells[ci];
                if (idx < 0 || idx >= layout.cellCount) continue;
                if (cellInsideAnyRoom(roomFootprintMask, idx)) continue;
                mask[idx] = 1;
            }
        } else {
            const p = path[i];
            const prev = i > 0 ? path[i - 1] : undefined;
            const next = i + 1 < path.length ? path[i + 1] : undefined;
            const cells = collectCorridorPathPointCells(p, prev, next, corridorWidth, false, i, path.length, layout);
            for (let ci = 0; ci < cells.length; ci++) {
                if (!layoutContainsAbsCell(layout, cells[ci].c, cells[ci].r)) continue;
                const idx = layoutAbsCellIndex(layout, cells[ci].c, cells[ci].r);
                if (cellInsideAnyRoom(roomFootprintMask, idx)) continue;
                const local = layoutAbsToLocalCell(layout, cells[ci].c, cells[ci].r);
                mask[layoutLocalCellIndex(layout, local.col, local.row)] = 1;
            }
        }
}
/** @param {Uint8Array} mask @param {number} cols @param {number} rows @param {number} originCol @param {number} originRow @param {number} heightLevel @param {number} thicknessLevel */
export function railWallsFromFloorMask(mask, cols, rows, originCol, originRow, heightLevel, thicknessLevel) {
    /** @type {RailWall[]} */
    const walls = [];
    const layout = createCellIndexLayout(originCol, originRow, cols, rows);
    /** @param {number} c @param {number} r @param {number} side */
    const push = (c, r, side) => {
        const abs = layoutLocalToAbsCell(layout, c, r);
        walls.push({ col: abs.col, row: abs.row, side, heightLevel, thicknessLevel });
    };
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
            if (!mask[layoutLocalCellIndex(layout, c, r)]) continue;
            if (r === 0 || !mask[layoutLocalCellIndex(layout, c, r - 1)]) push(c, r, 0);
            if (c + 1 >= cols || !mask[layoutLocalCellIndex(layout, c + 1, r)]) push(c, r, 1);
            if (r + 1 >= rows || !mask[layoutLocalCellIndex(layout, c, r + 1)]) push(c, r, 2);
            if (c === 0 || !mask[layoutLocalCellIndex(layout, c - 1, r)]) push(c, r, 3);
        }
    return walls;
}
/** @param {Cell[][]} paths @param {{ originCol: number, originRow: number, cols: number, rows: number }} stampBounds @param {number | number[]} corridorWidths @param {Set<string>} gapKeysWorld @param {Uint8Array} roomFootprintMask @param {number} heightLevel @param {number} thicknessLevel */
function corridorRailWallsForPaths(paths, stampBounds, corridorWidths, gapKeysWorld, roomFootprintMask, heightLevel, thicknessLevel) {
    /** @type {RailWall[]} */
    const rails = [];
    const layout = createCellIndexLayout(stampBounds.originCol, stampBounds.originRow, stampBounds.cols, stampBounds.rows);
    for (let pi = 0; pi < paths.length; pi++) {
        const laneMask = new Uint8Array(layout.cellCount);
        const width = Array.isArray(corridorWidths) ? corridorWidths[pi] : corridorWidths;
        stampCorridorTubeLocal(laneMask, stampBounds, paths[pi], width, roomFootprintMask);
        rails.push(...railWallsFromFloorMask(laneMask, stampBounds.cols, stampBounds.rows, stampBounds.originCol, stampBounds.originRow, heightLevel, thicknessLevel));
    }
    return omitRailWallsAtGapKeys(dedupeRailWallsByEdge(rails), gapKeysWorld);
}
/** @param {Cell[][]} paths @param {number[]} corridorWidths @param {GraphNode[]} rooms @param {ClosedRoom[]} closedRooms @param {{ originCol: number, originRow: number, cols: number, rows: number }} stampBounds @param {number} originCol @param {number} originRow @param {number} [railWallHeightLevel] @param {number} [railWallThicknessLevel] */
export function buildCorridorRailWallsFromPaths(
    paths,
    corridorWidths,
    rooms,
    closedRooms,
    stampBounds,
    originCol,
    originRow,
    railWallHeightLevel = DEFAULT_RAIL_WALL_HEIGHT_LEVEL,
    railWallThicknessLevel = DEFAULT_RAIL_WALL_THICKNESS_LEVEL,
) {
    const gapKeysWorld = roomWallGapKeysWorld(closedRooms, originCol, originRow);
    const layout = createCellIndexLayout(stampBounds.originCol, stampBounds.originRow, stampBounds.cols, stampBounds.rows);
    const roomFootprintMask = buildRoomFootprintMaskForLayout(layout, rooms);
    return corridorRailWallsForPaths(
        paths,
        stampBounds,
        corridorWidths,
        gapKeysWorld,
        roomFootprintMask,
        resolveRailWallHeightLevel(railWallHeightLevel),
        resolveRailWallThicknessLevel(railWallThicknessLevel),
    );
}
