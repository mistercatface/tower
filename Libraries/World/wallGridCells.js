/**
 * Static wall height levels stored on obstacleGrid.grid (0 = open, 1 … maxWallHeightLevel).
 */
import { colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { forEachObstacleGridCellInAabb, chunkWorldAabbScratch } from "../Spatial/grid/GridCoords.js";
import { isRailWallEdge, railWallCapLevel, railWallHeightPx, railWallThicknessPx } from "../Spatial/grid/CellEdge.js";
import { gridSettings } from "../../Config/balance/grid.js";
const sP1 = { x: 0, y: 0 };
const sP2 = { x: 0, y: 0 };
/** @param {number} col @param {number} row @param {number} edge 0=N,1=E,2=S,3=W */
export function gridWallEdgeNeighbor(col, row, edge) {
    let nc = col;
    let nr = row;
    if (edge === 0) nr = row - 1;
    else if (edge === 1) nc = col + 1;
    else if (edge === 2) nr = row + 1;
    else nc = col - 1;
    return { nc, nr };
}
/** Opposite side across a shared cell boundary (N↔S, E↔W). */
export function gridWallEdgeMirrorSide(side) {
    return (side + 2) % 4;
}
/** @param {number | null} neighborCap @param {number} faceHeight */
export function gridWallFaceVisible(neighborCap, faceHeight) {
    if (neighborCap == null) return true;
    return faceHeight > neighborCap;
}
/** @param {number | null} neighborCap @param {number} faceHeight */
export function gridWallFaceBaseZ(neighborCap, faceHeight) {
    if (neighborCap == null || faceHeight <= neighborCap) return 0;
    return neighborCap;
}
/** Inward normal (into the cell interior) for each edge. */
export function gridWallEdgeInwardNormal(edge) {
    if (edge === 0) return { x: 0, y: 1 };
    if (edge === 1) return { x: -1, y: 0 };
    if (edge === 2) return { x: 0, y: -1 };
    return { x: 1, y: 0 };
}
/**
 * World-space endpoints for one cell edge. `inset` moves the segment inward (into the cell).
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} col
 * @param {number} row
 * @param {number} edge
 * @param {{ x: number, y: number }} p1
 * @param {{ x: number, y: number }} p2
 * @param {number} [inset]
 */
export function gridWallEdgeEndpoints(grid, col, row, edge, p1, p2, inset = 0) {
    const bounds = grid.getCellBounds(col, row);
    const minX = bounds.minX;
    const minY = bounds.minY;
    const maxX = bounds.maxX;
    const maxY = bounds.maxY;
    if (edge === 0) {
        p1.x = minX;
        p1.y = minY + inset;
        p2.x = maxX;
        p2.y = minY + inset;
    } else if (edge === 1) {
        p1.x = maxX - inset;
        p1.y = minY;
        p2.x = maxX - inset;
        p2.y = maxY;
    } else if (edge === 2) {
        p1.x = maxX;
        p1.y = maxY - inset;
        p2.x = minX;
        p2.y = maxY - inset;
    } else {
        p1.x = minX + inset;
        p1.y = maxY;
        p2.x = minX + inset;
        p2.y = minY;
    }
}
/**
 * One physical edge rail per shared boundary — avoid double draw/collision/roof.
 * Interior edges emit from south/east owners so the face normal points into the stamped cell.
 */
export function gridWallEdgeRailShouldEmit(grid, col, row, edge) {
    if (!gridRailWallEdge(grid, col, row, edge)) return false;
    if (edge === 2 || edge === 1) return true;
    if (edge === 0) return row === 0;
    return col === 0;
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} side */
export function gridRailWallEdge(grid, col, row, side) {
    const edge = grid.edgeStore.get(col, row, side, grid.cols);
    if (!isRailWallEdge(edge)) return null;
    return edge;
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} side */
export function gridNeighborFillLevel(grid, col, row, side) {
    const { nc, nr } = gridWallEdgeNeighbor(col, row, side);
    if (nc < 0 || nc >= grid.cols || nr < 0 || nr >= grid.rows) return 0;
    return grid.grid[nc + nr * grid.cols];
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} side */
export function gridRailWallTopZAt(grid, col, row, side) {
    const edge = gridRailWallEdge(grid, col, row, side);
    if (!edge) return 0;
    return railWallHeightPx(edge, grid.cellSize, gridNeighborFillLevel(grid, col, row, side));
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} side @param {number} zLevel */
export function gridRailWallAtZLevel(grid, col, row, side, zLevel) {
    return gridWallEdgeRailShouldEmit(grid, col, row, side) && gridRailWallTopZAt(grid, col, row, side) === zLevel;
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} side */
export function gridRailWallFootprintHalfThickness(grid, col, row, side) {
    const railEdge = gridRailWallEdge(grid, col, row, side);
    if (!railEdge) return 0;
    return railWallThicknessPx(railEdge) / 2;
}
/**
 * Neighbor voxelBlock fill + railWall cap height for one edge.
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} col
 * @param {number} row
 * @param {number} side
 */
export function resolveGridWallEdgeRailNeighborContext(grid, col, row, side) {
    const neighborFillLevel = gridNeighborFillLevel(grid, col, row, side);
    const { nc, nr } = gridWallEdgeNeighbor(col, row, side);
    let neighborFillHeightPx = 0;
    if (nc >= 0 && nc < grid.cols && nr >= 0 && nr < grid.rows) neighborFillHeightPx = resolveCellWallHeightAtIdx(grid, nc + nr * grid.cols);
    const neighborCap = neighborFillHeightPx > 0 ? neighborFillHeightPx : null;
    const railEdge = gridRailWallEdge(grid, col, row, side);
    const capHeightPx = railEdge ? railWallHeightPx(railEdge, grid.cellSize, neighborFillLevel) : 0;
    return { neighborFillLevel, neighborFillHeightPx, neighborCap, capHeightPx };
}
/**
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {import("../Math/Aabb2D.js").Aabb2D} aabb
 * @param {number} zLevel
 * @param {(col: number, row: number, side: number, idx: number) => void} fn
 */
export function forEachEmittingRailWallAtZLevel(grid, aabb, zLevel, fn) {
    forEachObstacleGridCellInAabb(grid, aabb, (col, row, idx) => {
        for (let side = 0; side < 4; side++) {
            if (!gridRailWallAtZLevel(grid, col, row, side, zLevel)) continue;
            fn(col, row, side, idx);
        }
    });
}
/** Axis-aligned footprint for one edge rail (centered on the shared cell boundary). */
export function gridWallEdgeRailFootprintAabb(grid, col, row, edge) {
    const halfT = gridRailWallFootprintHalfThickness(grid, col, row, edge);
    const b = grid.getCellBounds(col, row);
    if (edge === 0) return { minX: b.minX, minY: b.minY - halfT, maxX: b.maxX, maxY: b.minY + halfT };
    if (edge === 1) return { minX: b.maxX - halfT, minY: b.minY, maxX: b.maxX + halfT, maxY: b.maxY };
    if (edge === 2) return { minX: b.minX, minY: b.maxY - halfT, maxX: b.maxX, maxY: b.maxY + halfT };
    return { minX: b.minX - halfT, minY: b.minY, maxX: b.minX + halfT, maxY: b.maxY };
}
/** Long-side endpoints for one face of the rail box. @param {0 | 1} railSide 0 = owning-cell side, 1 = neighbor side */
function gridWallEdgeRailSideEndpoints(grid, col, row, edge, railSide, p1, p2) {
    const halfT = gridRailWallFootprintHalfThickness(grid, col, row, edge);
    const b = grid.getCellBounds(col, row);
    if (edge === 0) {
        const y = railSide === 0 ? b.minY + halfT : b.minY - halfT;
        p1.x = b.minX;
        p1.y = y;
        p2.x = b.maxX;
        p2.y = y;
    } else if (edge === 2) {
        const y = railSide === 0 ? b.maxY - halfT : b.maxY + halfT;
        p1.x = b.maxX;
        p1.y = y;
        p2.x = b.minX;
        p2.y = y;
    } else if (edge === 1) {
        const x = railSide === 0 ? b.maxX - halfT : b.maxX + halfT;
        p1.x = x;
        p1.y = b.minY;
        p2.x = x;
        p2.y = b.maxY;
    } else {
        const x = railSide === 0 ? b.minX + halfT : b.minX - halfT;
        p1.x = x;
        p1.y = b.maxY;
        p2.x = x;
        p2.y = b.minY;
    }
}
/**
 * Thin wall box on one grid edge — draw, collision, and cap share this struct.
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} col
 * @param {number} row
 * @param {number} edge
 * @returns {object | null}
 */
export function resolveGridWallEdgeRailBox(grid, col, row, edge) {
    if (!gridWallEdgeRailShouldEmit(grid, col, row, edge)) return null;
    const cols = grid.cols;
    const idx = col + row * cols;
    const railEdge = gridRailWallEdge(grid, col, row, edge);
    if (!railEdge) return null;
    const { neighborCap, capHeightPx: edgeHeight } = resolveGridWallEdgeRailNeighborContext(grid, col, row, edge);
    if (edgeHeight <= 0) return null;
    if (!gridWallFaceVisible(neighborCap, edgeHeight)) return null;
    const fp = gridWallEdgeRailFootprintAabb(grid, col, row, edge);
    const inward = gridWallEdgeInwardNormal(edge);
    gridWallEdgeRailSideEndpoints(grid, col, row, edge, 0, sP1, sP2);
    const innerP1x = sP1.x;
    const innerP1y = sP1.y;
    const innerP2x = sP2.x;
    const innerP2y = sP2.y;
    gridWallEdgeRailSideEndpoints(grid, col, row, edge, 1, sP1, sP2);
    const wallBaseZ = gridWallFaceBaseZ(neighborCap, edgeHeight);
    return {
        staticGridEdgeRail: true,
        gridCol: col,
        gridRow: row,
        gridIdx: idx,
        gridSide: edge,
        minX: fp.minX,
        minY: fp.minY,
        maxX: fp.maxX,
        maxY: fp.maxY,
        innerP1x,
        innerP1y,
        innerP2x,
        innerP2y,
        outerP1x: sP1.x,
        outerP1y: sP1.y,
        outerP2x: sP2.x,
        outerP2y: sP2.y,
        inwardX: inward.x,
        inwardY: inward.y,
        wallBaseZ,
        wallHeight: edgeHeight - wallBaseZ,
        wallCapHeight: edgeHeight,
        edgeThickness: railWallThicknessPx(railEdge),
        cx: (fp.minX + fp.maxX) * 0.5,
        cy: (fp.minY + fp.maxY) * 0.5,
    };
}
/** @param {object} box */
function clearRailWallBoxDrawMemos(box) {
    delete box._wallAtlasStashes;
    delete box._wkByFace;
    delete box._cachedProfileId;
    delete box._faceSubdiv;
    delete box._faceSubdivKey;
}
/** @param {object} cur @param {object} next */
function extendCollinearRailWallBox(cur, next) {
    cur.minX = Math.min(cur.minX, next.minX);
    cur.minY = Math.min(cur.minY, next.minY);
    cur.maxX = Math.max(cur.maxX, next.maxX);
    cur.maxY = Math.max(cur.maxY, next.maxY);
    const edge = cur.gridSide;
    if (edge === 0) {
        cur.innerP1x = cur.minX;
        cur.innerP1y = cur.maxY;
        cur.innerP2x = cur.maxX;
        cur.innerP2y = cur.maxY;
        cur.outerP1x = cur.minX;
        cur.outerP1y = cur.minY;
        cur.outerP2x = cur.maxX;
        cur.outerP2y = cur.minY;
    } else if (edge === 2) {
        cur.innerP1x = cur.maxX;
        cur.innerP1y = cur.minY;
        cur.innerP2x = cur.minX;
        cur.innerP2y = cur.minY;
        cur.outerP1x = cur.maxX;
        cur.outerP1y = cur.maxY;
        cur.outerP2x = cur.minX;
        cur.outerP2y = cur.maxY;
    } else if (edge === 1) {
        cur.innerP1x = cur.minX;
        cur.innerP1y = cur.minY;
        cur.innerP2x = cur.minX;
        cur.innerP2y = cur.maxY;
        cur.outerP1x = cur.maxX;
        cur.outerP1y = cur.minY;
        cur.outerP2x = cur.maxX;
        cur.outerP2y = cur.maxY;
    } else {
        cur.innerP1x = cur.maxX;
        cur.innerP1y = cur.maxY;
        cur.innerP2x = cur.maxX;
        cur.innerP2y = cur.minY;
        cur.outerP1x = cur.minX;
        cur.outerP1y = cur.maxY;
        cur.outerP2x = cur.minX;
        cur.outerP2y = cur.minY;
    }
    cur.cx = (cur.minX + cur.maxX) * 0.5;
    cur.cy = (cur.minY + cur.maxY) * 0.5;
    clearRailWallBoxDrawMemos(cur);
}
/** @param {object} a @param {object} b */
function collinearRailWallBoxesAdjacent(a, b) {
    if (a.gridSide !== b.gridSide) return false;
    if (a.wallCapHeight !== b.wallCapHeight || a.wallBaseZ !== b.wallBaseZ || a.edgeThickness !== b.edgeThickness) return false;
    if (a.inwardX !== b.inwardX || a.inwardY !== b.inwardY) return false;
    const cellsPerChunk = gridSettings.minCellsPerChunk;
    if (a.gridSide === 0 || a.gridSide === 2) {
        if (a.gridRow !== b.gridRow) return false;
        if (Math.floor(a.gridCol / cellsPerChunk) !== Math.floor(b.gridCol / cellsPerChunk)) return false;
        return b.gridCol === a.gridCol + 1;
    }
    if (a.gridCol !== b.gridCol) return false;
    if (Math.floor(a.gridRow / cellsPerChunk) !== Math.floor(b.gridRow / cellsPerChunk)) return false;
    return b.gridRow === a.gridRow + 1;
}
/** Draw-only merge of consecutive railWall boxes on the same edge line. */
export function mergeCollinearRailWallBoxes(boxes) {
    if (boxes.length <= 1) return boxes;
    boxes.sort((a, b) => {
        if (a.gridSide !== b.gridSide) return a.gridSide - b.gridSide;
        if (a.wallCapHeight !== b.wallCapHeight) return a.wallCapHeight - b.wallCapHeight;
        if (a.wallBaseZ !== b.wallBaseZ) return a.wallBaseZ - b.wallBaseZ;
        if (a.edgeThickness !== b.edgeThickness) return a.edgeThickness - b.edgeThickness;
        if (a.gridSide === 0 || a.gridSide === 2) {
            if (a.gridRow !== b.gridRow) return a.gridRow - b.gridRow;
            return a.gridCol - b.gridCol;
        }
        if (a.gridCol !== b.gridCol) return a.gridCol - b.gridCol;
        return a.gridRow - b.gridRow;
    });
    const merged = [];
    let cur = boxes[0];
    merged.push(cur);
    for (let i = 1; i < boxes.length; i++) {
        const next = boxes[i];
        if (collinearRailWallBoxesAdjacent(cur, next)) extendCollinearRailWallBox(cur, next);
        else {
            cur = next;
            merged.push(cur);
        }
    }
    return merged;
}
/**
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} col
 * @param {number} row
 * @param {number} edge
 * @returns {object | null}
 */
export function resolveGridWallFace(grid, col, row, edge) {
    const cols = grid.cols;
    const idx = col + row * cols;
    const fillHeight = resolveCellWallHeightAtIdx(grid, idx);
    const storedEdge = gridRailWallEdge(grid, col, row, edge);
    const edgeLevel = storedEdge ? railWallCapLevel(storedEdge, gridNeighborFillLevel(grid, col, row, edge)) : 0;
    if (edgeLevel > 0) return null;
    if (fillHeight === 0) return null;
    const faceHeight = fillHeight;
    const { nc, nr } = gridWallEdgeNeighbor(col, row, edge);
    let neighborFillHeight = 0;
    if (nc >= 0 && nc < cols && nr >= 0 && nr < grid.rows) neighborFillHeight = resolveCellWallHeightAtIdx(grid, nc + nr * cols);
    const neighborCap = neighborFillHeight > 0 ? neighborFillHeight : null;
    if (!gridWallFaceVisible(neighborCap, faceHeight)) return null;
    gridWallEdgeEndpoints(grid, col, row, edge, sP1, sP2, 0);
    const cellBounds = grid.getCellBounds(col, row);
    const cx = (cellBounds.minX + cellBounds.maxX) / 2;
    const cy = (cellBounds.minY + cellBounds.maxY) / 2;
    const ecx = (sP1.x + sP2.x) / 2;
    const ecy = (sP1.y + sP2.y) / 2;
    const wallBaseZ = gridWallFaceBaseZ(neighborCap, faceHeight);
    return {
        staticGrid: true,
        gridCol: col,
        gridRow: row,
        gridIdx: idx,
        gridSide: edge,
        p1: { x: sP1.x, y: sP1.y },
        p2: { x: sP2.x, y: sP2.y },
        wallBaseZ,
        wallHeight: faceHeight - wallBaseZ,
        wallCapHeight: faceHeight,
        cx: ecx,
        cy: ecy,
        outX: ecx - cx,
        outY: ecy - cy,
    };
}
/**
 * Fill-voxel faces only (edge rails use `collectGridEdgeRailBoxesInAabb`).
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {import("../Math/Aabb2D.js").Aabb2D} bounds
 * @param {object[]} out
 */
export function collectGridWallFacesInAabb(grid, bounds, out) {
    out.length = 0;
    forEachObstacleGridCellInAabb(grid, bounds, (col, row, idx) => {
        if (resolveCellWallHeightAtIdx(grid, idx) === 0) return;
        for (let edge = 0; edge < 4; edge++) {
            const face = resolveGridWallFace(grid, col, row, edge);
            if (face) out.push(face);
        }
    });
}
/**
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {import("../Math/Aabb2D.js").Aabb2D} bounds
 * @param {object[]} out
 */
export function collectGridEdgeRailBoxesInAabb(grid, bounds, out) {
    out.length = 0;
    forEachObstacleGridCellInAabb(grid, bounds, (col, row, idx) => {
        if (!grid.edgeStore.hasAnyAtIdx(idx)) return;
        for (let edge = 0; edge < 4; edge++) {
            const box = resolveGridWallEdgeRailBox(grid, col, row, edge);
            if (box) out.push(box);
        }
    });
    const merged = mergeCollinearRailWallBoxes(out);
    out.length = 0;
    for (let i = 0; i < merged.length; i++) out.push(merged[i]);
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} idx */
export function gridValueAtIdx(grid, idx) {
    return grid.grid[idx];
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} idx */
export function cellIsStaticWallAtIdx(grid, idx) {
    if (grid.grid[idx] === 0) return false;
    if (!grid.segmentGrid) return true;
    return !grid.segmentGrid[idx]?.length;
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} idx @returns {number} px height; 0 when not a static wall cell */
export function resolveCellWallHeightAtIdx(grid, idx) {
    const level = grid.grid[idx];
    if (level === 0) return 0;
    if (grid.segmentGrid?.[idx]?.length) return 0;
    return level * grid.cellSize;
}
/** @param {import("../WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings} settings */
export function defaultWallHeightPx(settings) {
    return settings.wallHeight;
}
/** @param {{ wallHeight?: number | null } | null | undefined} segment @param {import("../WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings} settings */
export function resolveSegmentWallHeightPx(segment, settings) {
    return segment?.wallHeight ?? settings.wallHeight;
}
/** Cap height for wall atlas bake / projected draw when caller has no per-face override. */
export function resolveWallCapHeightPx(capHeight, settings) {
    return capHeight ?? settings.wallHeight;
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row */
export function cellIsStaticWall(grid, col, row) {
    if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return false;
    return cellIsStaticWallAtIdx(grid, colRowToIndex(col, row, grid.cols));
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row */
export function gridCellToGlobalColRow(grid, col, row) {
    const cellSize = grid.cellSize;
    return { globalCol: Math.floor((grid.minX + col * cellSize) / cellSize), globalRow: Math.floor((grid.minY + row * cellSize) / cellSize) };
}
/**
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} col
 * @param {number} row
 * @returns {number} px height; 0 when not a static wall cell
 */
export function resolveCellWallHeightPx(grid, col, row) {
    if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return 0;
    return resolveCellWallHeightAtIdx(grid, colRowToIndex(col, row, grid.cols));
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @returns {number[]} */
export function collectStaticRoofHeightsFromGrid(grid) {
    const seen = new Set();
    const out = [];
    const size = grid.cols * grid.rows;
    for (let idx = 0; idx < size; idx++) {
        const px = resolveCellWallHeightAtIdx(grid, idx);
        if (px > 0 && !seen.has(px)) {
            seen.add(px);
            out.push(px);
        }
    }
    out.sort((a, b) => a - b);
    return out;
}
/** voxelBlock fill heights + railWall edge heights (px) for roof / flat surface passes. */
export function scanStaticStructureZLevelsFromGrid(grid) {
    const seen = new Set();
    const out = [];
    const size = grid.cols * grid.rows;
    for (let idx = 0; idx < size; idx++) {
        const px = resolveCellWallHeightAtIdx(grid, idx);
        if (px > 0 && !seen.has(px)) {
            seen.add(px);
            out.push(px);
        }
    }
    const edgeLevels = grid.edgeStore.collectTopZLevels(grid);
    for (let i = 0; i < edgeLevels.length; i++) {
        const px = edgeLevels[i];
        if (!seen.has(px)) {
            seen.add(px);
            out.push(px);
        }
    }
    out.sort((a, b) => a - b);
    return out;
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @returns {number[]} */
export function collectStaticStructureZLevelsFromGrid(grid) {
    return grid.collectStaticStructureZLevels();
}
/**
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid
 * @param {number} chunkOriginX
 * @param {number} chunkOriginY
 * @param {number} chunkSizePx
 * @param {number} zLevel
 */
export function chunkHasStaticRoofAtLevel(obstacleGrid, chunkOriginX, chunkOriginY, chunkSizePx, zLevel) {
    let found = false;
    forEachObstacleGridCellInAabb(obstacleGrid, chunkWorldAabbScratch(chunkOriginX, chunkOriginY, chunkSizePx), (col, row, idx) => {
        if (resolveCellWallHeightAtIdx(obstacleGrid, idx) === zLevel) found = true;
    });
    return found;
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid @param {number} chunkOriginX @param {number} chunkOriginY @param {number} chunkSizePx @param {number} zLevel */
export function chunkHasStaticStructureAtLevel(obstacleGrid, chunkOriginX, chunkOriginY, chunkSizePx, zLevel) {
    return chunkHasStaticRoofAtLevel(obstacleGrid, chunkOriginX, chunkOriginY, chunkSizePx, zLevel) || chunkHasStaticEdgeRailsAtLevel(obstacleGrid, chunkOriginX, chunkOriginY, chunkSizePx, zLevel);
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid @param {number} chunkOriginX @param {number} chunkOriginY @param {number} chunkSizePx @param {number} zLevel */
export function chunkHasStaticEdgeRailsAtLevel(obstacleGrid, chunkOriginX, chunkOriginY, chunkSizePx, zLevel) {
    let found = false;
    forEachEmittingRailWallAtZLevel(obstacleGrid, chunkWorldAabbScratch(chunkOriginX, chunkOriginY, chunkSizePx), zLevel, () => {
        found = true;
    });
    return found;
}
