import { unionCellBounds } from "../../../Libraries/DataStructures/CellRect.js";
import { gridSettings } from "../../../Config/world.js";
import { rebuildLabMapCaches } from "../../../Libraries/Render/map/labMapCaches.js";
import { withSeededRandom } from "../../../Libraries/Random/index.js";
import { fillRandomGrid, runCellularAutomata } from "../../../Libraries/CA/index.js";
import { bakeSnakeRailBspMaze } from "../../../Libraries/Game/snake/snakeRailBspMaze.js";
import { commitBoundaryEdit } from "../../../Libraries/Sandbox/boundaryEdit.js";
import { stampRailWallsBatch } from "../../../Libraries/Sandbox/gridWallEdit.js";
import { centerReachAabbInto, createAabb, padAabb, unionAabb } from "../../../Libraries/Math/Aabb2D.js";
import { forEachObstacleGridCellInAabb } from "../../../Libraries/Spatial/grid/GridCoords.js";
import { setBoundary } from "../../../Libraries/Spatial/grid/boundaryOccupancy.js";
import { cellIsStaticWallAtIdx } from "../../../Libraries/Spatial/grid/gridCellTopology.js";
import { cellInRect } from "../../../Libraries/Spatial/grid/GridUtils.js";
import { GRID_NAV_EPOCH, bumpGridNavEpoch } from "../../../Libraries/Spatial/grid/gridNavEpoch.js";
import { clampStampWallHeightLevel } from "../../../Libraries/WorldSurface/stampWallHeight.js";
import {
    MAP_GEN_KINDS,
    applyMapGenShapeMask,
    forEachGlobalCellInMapGenBounds,
    getInnerRadiusCells,
    getMapGenBoundsAabb,
    getMapGenBoundsCenterWorld,
    getMapGenBoundsStampExtent,
    isGlobalCellInMapGenBounds,
    migrateMapGenBoundsForMode,
    syncMapGenBoundsFromPlay,
    getMapGenBoundsConfig,
} from "../../../Libraries/Sandbox/mapGenBounds.js";
export const PLAY_AREA_CELL_OPTIONS = [64, 128, 256, 512, 1024];
const CLEAR_CIRCLE_BOUNDS = createAabb();
/** @param {number} cells */
export function playAreaCellsToIndex(cells) {
    const index = PLAY_AREA_CELL_OPTIONS.indexOf(cells);
    return index >= 0 ? index : PLAY_AREA_CELL_OPTIONS.indexOf(256);
}
/** Tile Lab cold start: play area, nav worker sync, map overview + path-debug caches. */
export async function initTileLabWorld(state) {
    await applyPlayAreaConfig(state);
}
/** Resize obstacle grid and sync cavern/rail stamp bounds to play area — centered on the camera. */
export async function applyPlayAreaConfig(state) {
    const { viewport, editor } = state;
    const { playConfig } = editor;
    const cellSize = gridSettings.cellSize;
    for (let i = 0; i < MAP_GEN_KINDS.length; i++) {
        const kind = MAP_GEN_KINDS[i];
        const config = getMapGenBoundsConfig(editor, kind);
        syncMapGenBoundsFromPlay(viewport, playConfig, config, cellSize, { center: true, syncSizeFromPlay: true });
        migrateMapGenBoundsForMode(config);
    }
    ensureLabObstacleGridCoverage(state);
    await state.navigation.onObstaclesChanged(null);
    await rebuildLabMapCaches(state);
}
/** @param {import("../state.js").TileLabGameState} state @param {number} centerWorldX @param {number} centerWorldY @param {number} radiusWorld @returns {{ startCol: number, endCol: number, startRow: number, endRow: number } | null} */
function clearStaticWallsInWorldCircle(state, centerWorldX, centerWorldY, radiusWorld) {
    const grid = state.obstacleGrid;
    centerReachAabbInto(CLEAR_CIRCLE_BOUNDS, centerWorldX, centerWorldY, radiusWorld);
    let startCol = Infinity;
    let endCol = -1;
    let startRow = Infinity;
    let endRow = -1;
    forEachObstacleGridCellInAabb(grid, CLEAR_CIRCLE_BOUNDS, (col, row, idx) => {
        const bounds = grid.getCellBounds(col, row);
        const cx = (bounds.minX + bounds.maxX) * 0.5;
        const cy = (bounds.minY + bounds.maxY) * 0.5;
        if (Math.hypot(cx - centerWorldX, cy - centerWorldY) >= radiusWorld) return;
        let cellChanged = false;
        if (cellIsStaticWallAtIdx(grid, idx)) {
            grid.grid[idx] = 0;
            cellChanged = true;
        }
        if (grid.edgeStore.hasAnyAtIdx(idx)) {
            grid.clearCellEdges(col, row);
            cellChanged = true;
        }
        if (!cellChanged) return;
        if (col < startCol) startCol = col;
        if (col > endCol) endCol = col;
        if (row < startRow) startRow = row;
        if (row > endRow) endRow = row;
    });
    if (startCol === Infinity) return null;
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    const damageBounds = { startCol, endCol, startRow, endRow };
    state.worldSurfaces.invalidateGridBounds(damageBounds, state);
    return damageBounds;
}
/** @param {import("../state.js").TileLabGameState} state @returns {{ startCol: number, endCol: number, startRow: number, endRow: number } | null} */
function eraseWallsInShape(state) {
    const grid = state.obstacleGrid;
    const eraseConfig = state.editor.eraseConfig;
    const cellSize = grid.cellSize;
    let startCol = Infinity;
    let endCol = -1;
    let startRow = Infinity;
    let endRow = -1;
    forEachGlobalCellInMapGenBounds(eraseConfig, (globalCol, globalRow) => {
        const { col, row } = grid.worldToGrid(globalCol * cellSize, globalRow * cellSize);
        if (!cellInRect(col, row, grid.cols, grid.rows)) return;
        const idx = col + row * grid.cols;
        let cellChanged = false;
        if (cellIsStaticWallAtIdx(grid, idx)) {
            grid.grid[idx] = 0;
            cellChanged = true;
        }
        if (grid.edgeStore.hasAnyAtIdx(idx)) {
            grid.clearCellEdges(col, row);
            cellChanged = true;
        }
        if (!cellChanged) return;
        if (col < startCol) startCol = col;
        if (col > endCol) endCol = col;
        if (row < startRow) startRow = row;
        if (row > endRow) endRow = row;
    });
    if (startCol === Infinity) return null;
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    return { startCol, endCol, startRow, endRow };
}
/** @param {import("../state.js").TileLabGameState} state */
export async function eraseLabWallsInBounds(state) {
    ensureLabObstacleGridCoverage(state, getMapGenBoundsAabb(state.editor.eraseConfig, gridSettings.cellSize));
    const damageBounds = eraseWallsInShape(state);
    if (!damageBounds) return;
    state.worldSurfaces.invalidateGridBounds(damageBounds, state);
    await state.navigation.onObstaclesChanged(damageBounds);
    state.worldSurfaces.clearBakeCache();
    await rebuildLabMapCaches(state);
}
export function ensureLabObstacleGridCoverage(state, extraAabb = null) {
    const cellSize = gridSettings.cellSize;
    let required = getMapGenBoundsAabb(state.editor.cavernConfig, cellSize);
    if (extraAabb) required = unionAabb(required, extraAabb);
    required = padAabb(required, cellSize);
    const grid = state.obstacleGrid;
    const expanded = grid.expandToCoverAabb(required);
    return expanded;
}
function clearCavernOccupancyBoundaryStrip(cells, cols, rows, side, stripRows) {
    const depth = Math.max(1, Math.round(stripRows));
    if (side === "south") {
        for (let strip = 0; strip < depth; strip++) {
            const lr = rows - 1 - strip;
            if (lr < 0) break;
            for (let lc = 0; lc < cols; lc++) cells[lr * cols + lc] = 0;
        }
        return;
    }
    if (side === "north")
        for (let strip = 0; strip < depth; strip++) {
            if (strip >= rows) break;
            for (let lc = 0; lc < cols; lc++) cells[strip * cols + lc] = 0;
        }
}
function carveCavernSouthVent(cells, cols, rows, stripRows) {
    const depth = Math.max(1, Math.round(stripRows));
    const startRow = rows - depth;
    const seen = new Uint8Array(cols * rows);
    const queue = [];
    for (let pass = 0; pass < 32; pass++) {
        seen.fill(0);
        const components = [];
        for (let lr = 0; lr < rows; lr++)
            for (let lc = 0; lc < cols; lc++) {
                const idx = lr * cols + lc;
                if (cells[idx] !== 0 || seen[idx]) continue;
                const members = [];
                seen[idx] = 1;
                queue.length = 0;
                queue.push(idx);
                while (queue.length) {
                    const cur = queue.pop();
                    members.push(cur);
                    const cr = (cur / cols) | 0;
                    const cc = cur - cr * cols;
                    if (cc > 0) {
                        const left = cur - 1;
                        if (cells[left] === 0 && !seen[left]) {
                            seen[left] = 1;
                            queue.push(left);
                        }
                    }
                    if (cc + 1 < cols) {
                        const right = cur + 1;
                        if (cells[right] === 0 && !seen[right]) {
                            seen[right] = 1;
                            queue.push(right);
                        }
                    }
                    if (cr > 0) {
                        const up = cur - cols;
                        if (cells[up] === 0 && !seen[up]) {
                            seen[up] = 1;
                            queue.push(up);
                        }
                    }
                    if (cr + 1 < rows) {
                        const down = cur + cols;
                        if (cells[down] === 0 && !seen[down]) {
                            seen[down] = 1;
                            queue.push(down);
                        }
                    }
                }
                let touchesSouth = false;
                for (let i = 0; i < members.length; i++)
                    if ((members[i] / cols) | (0 >= startRow)) {
                        touchesSouth = true;
                        break;
                    }
                components.push({ touchesSouth, sample: members[0] });
            }
        let carved = false;
        for (let ci = 0; ci < components.length; ci++) {
            const component = components[ci];
            if (component.touchesSouth) continue;
            carved = true;
            const targetRow = (component.sample / cols) | 0;
            const targetCol = component.sample - targetRow * cols;
            const exitCol = (cols / 2) | 0;
            const exitRow = rows - depth;
            for (let lc = Math.min(exitCol, targetCol); lc <= Math.max(exitCol, targetCol); lc++) cells[exitRow * cols + lc] = 0;
            for (let lr = exitRow; lr <= targetRow; lr++) cells[lr * cols + targetCol] = 0;
        }
        if (!carved) return;
    }
}
function generateCavernOccupancy(config, { openBoundarySides = null, openBoundaryRows = 1 } = {}) {
    const { originCol, originRow, cols, rows } = getMapGenBoundsStampExtent(config);
    let cells = fillRandomGrid(cols, rows, config.fillChance);
    cells = runCellularAutomata(cols, rows, cells, { iterations: config.iterations, scratch: new Uint8Array(cols * rows) });
    applyMapGenShapeMask(cells, cols, rows, config, originCol, originRow);
    if (openBoundarySides?.south) {
        clearCavernOccupancyBoundaryStrip(cells, cols, rows, "south", openBoundaryRows);
        carveCavernSouthVent(cells, cols, rows, openBoundaryRows);
    }
    if (openBoundarySides?.north) clearCavernOccupancyBoundaryStrip(cells, cols, rows, "north", openBoundaryRows);
    return { originCol, originRow, cols, rows, cells };
}
/** @param {import("../state.js").TileLabGameState} state */
export async function generateLabCaverns(state, { openBoundarySides = null, openBoundaryRows = 1 } = {}) {
    const { cavernConfig } = state.editor;
    const cellSize = gridSettings.cellSize;
    /** @type {{ originCol: number, originRow: number, cols: number, rows: number, cells: Uint8Array }} */
    let stamp = null;
    withSeededRandom(state.mapSeed, () => {
        stamp = generateCavernOccupancy(cavernConfig, { openBoundarySides, openBoundaryRows });
    });
    ensureLabObstacleGridCoverage(state);
    const level = clampStampWallHeightLevel(cavernConfig.wallHeightLevel, state.worldSurfaces.settings);
    let damageBounds = state.obstacleGrid.stampStaticWalls(stamp.originCol, stamp.originRow, stamp.cols, stamp.rows, stamp.cells, { additive: true, heightLevel: level });
    if (cavernConfig.boundsMode === "donut") {
        const innerR = getInnerRadiusCells(cavernConfig) * cellSize;
        const center = getMapGenBoundsCenterWorld(cavernConfig, cellSize);
        const cleared = clearStaticWallsInWorldCircle(state, center.x, center.y, innerR);
        if (cleared) damageBounds = unionCellBounds(damageBounds, cleared);
    }
    state.worldSurfaces.invalidateGridBounds(damageBounds, state);
    await state.navigation.onObstaclesChanged(damageBounds);
    state.floorSeed = state.mapSeed;
    state.worldSurfaces.clearBakeCache();
    await rebuildLabMapCaches(state);
}
function clearRailStampCellBounds(grid, startCol, endCol, startRow, endRow) {
    for (let r = startRow; r <= endRow; r++)
        for (let c = startCol; c <= endCol; c++) {
            const idx = c + r * grid.cols;
            if (grid.grid[idx] !== 0) grid.grid[idx] = 0;
            if (grid.edgeStore.hasAnyAtIdx(idx)) grid.clearCellEdges(c, r);
        }
}
function clearMapGenRectWalkable(state, config) {
    const grid = state.obstacleGrid;
    const cellSize = gridSettings.cellSize;
    const { originCol, originRow, cols, rows } = getMapGenBoundsStampExtent(config);
    const { col: baseCol, row: baseRow } = grid.worldToGrid(originCol * cellSize, originRow * cellSize);
    const startCol = Math.max(0, baseCol);
    const endCol = Math.min(grid.cols - 1, baseCol + cols - 1);
    const startRow = Math.max(0, baseRow);
    const endRow = Math.min(grid.rows - 1, baseRow + rows - 1);
    clearRailStampCellBounds(grid, startCol, endCol, startRow, endRow);
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    return { startCol, endCol, startRow, endRow };
}
export function clearSnakeRegionPaddingStrip(state, paddingCells) {
    const { cavernConfig, playConfig } = state.editor;
    const padding = Math.max(0, Math.round(paddingCells));
    const innerRows = Math.max(2, playConfig.playAreaRows - padding);
    const topRows = Math.floor(innerRows / 2);
    return clearMapGenRectWalkable(state, {
        boundsMode: "rect",
        boundsCol: cavernConfig.boundsCol,
        boundsRow: cavernConfig.boundsRow + topRows,
        boundsCols: cavernConfig.boundsCols,
        boundsRows: padding,
    });
}
function clearRailZoneNorthStrip(grid, startCol, endCol, startRow, endRow, stripRows) {
    const depth = Math.max(1, Math.round(stripRows));
    const lastRow = Math.min(endRow, startRow + depth - 1);
    for (let r = startRow; r <= lastRow; r++)
        for (let c = startCol; c <= endCol; c++) {
            grid.grid[c + r * grid.cols] = 0;
            grid.clearCellEdges(c, r);
        }
    return { startCol, endCol, startRow, endRow: lastRow };
}
function stampGlobalRailWalls(state, rails) {
    const grid = state.obstacleGrid;
    const cellSize = gridSettings.cellSize;
    const gridRails = [];
    for (let i = 0; i < rails.length; i++) {
        const wall = rails[i];
        const { col, row } = grid.worldToGrid(wall.col * cellSize, wall.row * cellSize);
        if (!cellInRect(col, row, grid.cols, grid.rows)) continue;
        gridRails.push({ col, row, side: wall.side, heightLevel: wall.heightLevel, thicknessLevel: wall.thicknessLevel });
    }
    stampRailWallsBatch(state, gridRails);
}
export async function generateLabRailBspMaze(state, options = {}) {
    const { railConfig } = state.editor;
    const cellSize = gridSettings.cellSize;
    const stampBoundsAabb = getMapGenBoundsAabb(railConfig, cellSize);
    ensureLabObstacleGridCoverage(state, stampBoundsAabb);
    const grid = state.obstacleGrid;
    const { originCol, originRow, cols, rows } = getMapGenBoundsStampExtent(railConfig);
    const { col: baseCol, row: baseRow } = grid.worldToGrid(originCol * cellSize, originRow * cellSize);
    const startCol = Math.max(0, baseCol);
    const endCol = Math.min(grid.cols - 1, baseCol + cols - 1);
    const startRow = Math.max(0, baseRow);
    const endRow = Math.min(grid.rows - 1, baseRow + rows - 1);
    clearRailStampCellBounds(grid, startCol, endCol, startRow, endRow);
    const rails = bakeSnakeRailBspMaze(
        { originCol, originRow, cols, rows },
        {
            railWallHeightLevel: options.railWallHeightLevel ?? railConfig.wallHeightLevel,
            railWallThicknessLevel: options.railWallThicknessLevel ?? railConfig.edgeThickness,
            roomSizeMin: options.roomSizeMin,
            roomSizeMax: options.roomSizeMax,
            roomMargin: options.roomMargin,
            corridorWidthMin: options.corridorWidthMin,
            corridorWidthMax: options.corridorWidthMax,
            extraLinkRatio: options.extraLinkRatio,
            northReserveRows: options.northReserveRows,
        },
        state.mapSeed,
    );
    stampGlobalRailWalls(state, rails);
    const northRows = Math.max(1, Math.round(options.northReserveRows ?? 3));
    const northBounds = clearRailZoneNorthStrip(grid, startCol, endCol, startRow, endRow, northRows);
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    let damageBounds = { startCol, endCol, startRow, endRow };
    damageBounds = unionCellBounds(damageBounds, northBounds);
    commitBoundaryEdit(state, northBounds);
    state.worldSurfaces.invalidateGridBounds(damageBounds, state);
    await state.navigation.onObstaclesChanged(damageBounds);
    state.floorSeed = state.mapSeed;
    state.worldSurfaces.clearBakeCache();
    await rebuildLabMapCaches(state);
}
export async function generateLabRailCaverns(state, { openBoundarySides = null } = {}) {
    const { railConfig } = state.editor;
    const cellSize = gridSettings.cellSize;
    const stampBounds = getMapGenBoundsAabb(railConfig, cellSize);
    ensureLabObstacleGridCoverage(state, stampBounds);
    const level = clampStampWallHeightLevel(railConfig.wallHeightLevel, state.worldSurfaces.settings);
    const thickness = railConfig.edgeThickness;
    const grid = state.obstacleGrid;
    const { originCol, originRow, cols, rows } = getMapGenBoundsStampExtent(railConfig);
    // 1. Generate Horizontal Edges CA
    const hCols = cols;
    const hRows = rows + 1;
    let hCells = null;
    withSeededRandom(state.mapSeed, () => {
        hCells = fillRandomGrid(hCols, hRows, railConfig.fillChance);
        hCells = runCellularAutomata(hCols, hRows, hCells, { iterations: railConfig.iterations, scratch: new Uint8Array(hCols * hRows) });
    });
    // Mask Horizontal Edges based on cavern shape bounds
    for (let lr = 0; lr < hRows; lr++)
        for (let lc = 0; lc < hCols; lc++) {
            const gc = originCol + lc;
            const gr = originRow + lr;
            const in1 = isGlobalCellInMapGenBounds(railConfig, gc, gr - 1);
            const in2 = isGlobalCellInMapGenBounds(railConfig, gc, gr);
            if (!in1 && !in2) hCells[lr * hCols + lc] = 0;
        }
    if (openBoundarySides?.north) for (let lc = 0; lc < hCols; lc++) hCells[lc] = 0;
    if (openBoundarySides?.south) {
        const lr = hRows - 1;
        for (let lc = 0; lc < hCols; lc++) hCells[lr * hCols + lc] = 0;
    }
    // 2. Generate Vertical Edges CA (slightly offset the seed so H and V structures are unique)
    const vCols = cols + 1;
    const vRows = rows;
    let vCells = null;
    withSeededRandom(state.mapSeed + 1, () => {
        vCells = fillRandomGrid(vCols, vRows, railConfig.fillChance);
        vCells = runCellularAutomata(vCols, vRows, vCells, { iterations: railConfig.iterations, scratch: new Uint8Array(vCols * vRows) });
    });
    // Mask Vertical Edges based on cavern shape bounds
    for (let lr = 0; lr < vRows; lr++)
        for (let lc = 0; lc < vCols; lc++) {
            const gc = originCol + lc;
            const gr = originRow + lr;
            const in1 = isGlobalCellInMapGenBounds(railConfig, gc - 1, gr);
            const in2 = isGlobalCellInMapGenBounds(railConfig, gc, gr);
            if (!in1 && !in2) vCells[lr * vCols + lc] = 0;
        }
    if (openBoundarySides?.west) for (let lr = 0; lr < vRows; lr++) vCells[lr * vCols] = 0;
    if (openBoundarySides?.east) {
        const lc = vCols - 1;
        for (let lr = 0; lr < vRows; lr++) vCells[lr * vCols + lc] = 0;
    }
    const { col: baseCol, row: baseRow } = grid.worldToGrid(originCol * cellSize, originRow * cellSize);
    const startCol = Math.max(0, baseCol);
    const endCol = Math.min(grid.cols - 1, baseCol + cols - 1);
    const startRow = Math.max(0, baseRow);
    const endRow = Math.min(grid.rows - 1, baseRow + rows - 1);
    // 3. Clear existing walls & edges in target bounds
    for (let r = startRow; r <= endRow; r++)
        for (let c = startCol; c <= endCol; c++) {
            const idx = c + r * grid.cols;
            if (grid.grid[idx] !== 0) grid.grid[idx] = 0;
            if (grid.edgeStore.hasAnyAtIdx(idx)) grid.clearCellEdges(c, r);
        }
    // 4. Stamp Horizontal Edges
    for (let lr = 0; lr < hRows; lr++)
        for (let lc = 0; lc < hCols; lc++) {
            if (hCells[lr * hCols + lc] !== 1) continue;
            const col = baseCol + lc;
            const row = baseRow + lr;
            if (row >= 0 && row < grid.rows && col >= 0 && col < grid.cols) setBoundary(grid, col, row, 0, { kind: "railWall", capHeightLevel: level, thicknessLevel: thickness });
            else if (row - 1 >= 0 && row - 1 < grid.rows && col >= 0 && col < grid.cols) setBoundary(grid, col, row - 1, 2, { kind: "railWall", capHeightLevel: level, thicknessLevel: thickness });
        }
    // 5. Stamp Vertical Edges
    for (let lr = 0; lr < vRows; lr++)
        for (let lc = 0; lc < vCols; lc++) {
            if (vCells[lr * vCols + lc] !== 1) continue;
            const col = baseCol + lc;
            const row = baseRow + lr;
            if (col >= 0 && col < grid.cols && row >= 0 && row < grid.rows) setBoundary(grid, col, row, 3, { kind: "railWall", capHeightLevel: level, thicknessLevel: thickness });
            else if (col - 1 >= 0 && col - 1 < grid.cols && row >= 0 && row < grid.rows) setBoundary(grid, col - 1, row, 1, { kind: "railWall", capHeightLevel: level, thicknessLevel: thickness });
        }
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    let damageBounds = { startCol, endCol, startRow, endRow };
    if (railConfig.boundsMode === "donut") {
        const innerR = getInnerRadiusCells(railConfig) * cellSize;
        const center = getMapGenBoundsCenterWorld(railConfig, cellSize);
        const cleared = clearStaticWallsInWorldCircle(state, center.x, center.y, innerR);
        if (cleared) damageBounds = unionCellBounds(damageBounds, cleared);
    }
    state.worldSurfaces.invalidateGridBounds(damageBounds, state);
    await state.navigation.onObstaclesChanged(damageBounds);
    state.floorSeed = state.mapSeed;
    state.worldSurfaces.clearBakeCache();
    await rebuildLabMapCaches(state);
}
