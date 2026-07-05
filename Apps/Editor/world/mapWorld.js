import { unionCellBounds } from "../../../Libraries/Spatial/spatial.js";
import { gridSettings } from "../../../Config/world.js";
import { withSeededRandom } from "../../../Libraries/Random/index.js";
import { fillRandomGrid, runCellularAutomata } from "../../../Libraries/CA/index.js";
import { bakeRailMazeDfs } from "../../../Libraries/Procedural/Mazes/railMazeDfs.js";
import { generateCavernOccupancy } from "../../../Libraries/Procedural/Mazes/cavernOccupancy.js";
import { commitGridNavEdit, commitGridNavEditUnion } from "../../../Libraries/Sandbox/gridNavEdit.js";
import { planRailMazeCorridorBelts, stampGlobalRailMazeBelts, stampGlobalRailWalls } from "../../../Libraries/Procedural/Mazes/railMazeCorridorBelts.js";
import { getNavWalkableCellIndex } from "../../../Libraries/Procedural/Mazes/walkableCells.js";
import { centerReachAabbInto, createAabb, padAabb, unionAabb } from "../../../Libraries/Math/math.js";
import { forEachObstacleGridCellInAabb } from "../../../Libraries/Spatial/spatial.js";
import { setBoundary } from "../../../Libraries/Spatial/spatial.js";
import { cellIsStaticWallAtIdx } from "../../../Libraries/Spatial/spatial.js";
import { cellInRect } from "../../../Libraries/Spatial/spatial.js";
import { GRID_NAV_EPOCH, bumpGridNavEpoch } from "../../../Libraries/Spatial/spatial.js";
import { clampStampWallHeightLevel } from "../../../Libraries/WorldSurface/stampWallHeight.js";
import {
    MAP_GEN_KINDS,
    applyMapGenShapeMask,
    forEachGlobalCellInMapGenBounds,
    getInnerRadiusCells,
    getMapGenBoundsAabb,
    getMapGenBoundsCenterWorld,
    getMapGenBoundsStampExtent,
    migrateMapGenBoundsForMode,
    syncMapGenBoundsFromPlay,
    getMapGenBoundsConfig,
    isIdxInMapGenBounds,
    registerMapGenBoundsGridExpansionListener,
} from "../../../Libraries/Sandbox/mapGenBounds.js";
const CLEAR_CIRCLE_BOUNDS = createAabb();
/** Tile Lab cold start: play area, nav worker sync, map overview + path-debug caches. */
export async function initTileLabWorld(state) {
    await applyPlayAreaConfig(state);
}
/** Resize obstacle grid and sync cavern/rail stamp bounds to play area — centered on the camera. */
export async function applyPlayAreaConfig(state) {
    registerMapGenBoundsGridExpansionListener(state);
    const { viewport, editor } = state;
    const { playConfig } = editor;
    const cellSize = gridSettings.cellSize;
    for (let i = 0; i < MAP_GEN_KINDS.length; i++) {
        const kind = MAP_GEN_KINDS[i];
        const config = getMapGenBoundsConfig(editor, kind);
        syncMapGenBoundsFromPlay(state.obstacleGrid, viewport, playConfig, config, cellSize, { center: true, syncSizeFromPlay: true });
        migrateMapGenBoundsForMode(state.obstacleGrid, config);
    }
    ensureLabObstacleGridCoverage(state);
    applyEditorRegionSurfaceProfiles(state);
    await commitGridNavEdit(state, null, { fullNavSync: true });
}
/** @param {import("../state.js").TileLabGameState} state @param {number} centerWorldX @param {number} centerWorldY @param {number} radiusWorld @returns {{ startCol: number, endCol: number, startRow: number, endRow: number } | null} */
function clearStaticWallsInWorldCircle(state, centerWorldX, centerWorldY, radiusWorld) {
    const grid = state.obstacleGrid;
    centerReachAabbInto(CLEAR_CIRCLE_BOUNDS, centerWorldX, centerWorldY, radiusWorld);
    let startCol = Infinity;
    let endCol = -1;
    let startRow = Infinity;
    let endRow = -1;
    forEachObstacleGridCellInAabb(grid, CLEAR_CIRCLE_BOUNDS, (idx) => {
        const bounds = grid.getCellBoundsByIdx(idx);
        const cx = (bounds.minX + bounds.maxX) * 0.5;
        const cy = (bounds.minY + bounds.maxY) * 0.5;
        if (Math.hypot(cx - centerWorldX, cy - centerWorldY) >= radiusWorld) return;
        let cellChanged = false;
        if (cellIsStaticWallAtIdx(grid, idx)) {
            grid.grid[idx] = 0;
            cellChanged = true;
        }
        if (grid.hasAnyCellEdgeAtIdx(idx)) {
            grid.clearCellEdges(idx);
            cellChanged = true;
        }
        if (!cellChanged) return;
        const col = idx % grid.cols;
        const row = (idx / grid.cols) | 0;
        if (col < startCol) startCol = col;
        if (col > endCol) endCol = col;
        if (row < startRow) startRow = row;
        if (row > endRow) endRow = row;
    });
    if (startCol === Infinity) return null;
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    return { startCol, endCol, startRow, endRow };
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
    forEachGlobalCellInMapGenBounds(grid, eraseConfig, (idx) => {
        let cellChanged = false;
        if (cellIsStaticWallAtIdx(grid, idx)) {
            grid.grid[idx] = 0;
            cellChanged = true;
        }
        if (grid.hasAnyCellEdgeAtIdx(idx)) {
            grid.clearCellEdges(idx);
            cellChanged = true;
        }
        if (!cellChanged) return;
        const col = idx % grid.cols;
        const row = (idx / grid.cols) | 0;
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
    ensureLabObstacleGridCoverage(state, getMapGenBoundsAabb(state.obstacleGrid, state.editor.eraseConfig, gridSettings.cellSize));
    const damageBounds = eraseWallsInShape(state);
    if (!damageBounds) return;
    await commitGridNavEdit(state, damageBounds);
    state.worldSurfaces.clearBakeCache();
}
export function ensureLabObstacleGridCoverage(state, extraAabb = null) {
    const cellSize = gridSettings.cellSize;
    let required = getMapGenBoundsAabb(state.obstacleGrid, state.editor.cavernConfig, cellSize);
    if (extraAabb) required = unionAabb(required, extraAabb);
    required = padAabb(required, cellSize);
    const grid = state.obstacleGrid;
    const expanded = grid.expandToCoverAabb(required);
    return expanded;
}
/** @param {import("../state.js").TileLabGameState} state */
export async function generateLabCaverns(state, { openBoundarySides = null, openBoundaryRows = 1 } = {}) {
    const { cavernConfig } = state.editor;
    const grid = state.obstacleGrid;
    const cellSize = gridSettings.cellSize;
    /** @type {{ originIdx: number, cols: number, rows: number, cells: Uint8Array }} */
    let stamp = null;
    withSeededRandom(state.mapSeed, () => {
        stamp = generateCavernOccupancy(grid, cavernConfig, { openBoundarySides, openBoundaryRows });
    });
    ensureLabObstacleGridCoverage(state);
    const level = clampStampWallHeightLevel(cavernConfig.wallHeightLevel, state.worldSurfaces.settings);
    let damageBounds = state.obstacleGrid.stampStaticWalls(stamp.originIdx, stamp.cols, stamp.rows, stamp.cells, { additive: true, heightLevel: level });
    if (cavernConfig.boundsMode === "donut") {
        const innerR = getInnerRadiusCells(cavernConfig) * cellSize;
        const center = getMapGenBoundsCenterWorld(cavernConfig, cellSize);
        const cleared = clearStaticWallsInWorldCircle(state, center.x, center.y, innerR);
        if (cleared) damageBounds = unionCellBounds(damageBounds, cleared);
    }
    const cavernProfile = cavernConfig.surfaceProfileId || "tomatoGarden";
    applyMapGenSurfaceProfile(state, cavernConfig, cavernProfile);
    await commitGridNavEdit(state, null, { fullNavSync: true });
    state.floorSeed = state.mapSeed;
    state.worldSurfaces.clearBakeCache();
}
function clearRailStampCellBounds(grid, startCol, endCol, startRow, endRow) {
    for (let r = startRow; r <= endRow; r++)
        for (let c = startCol; c <= endCol; c++) {
            const idx = c + r * grid.cols;
            if (grid.grid[idx] !== 0) grid.grid[idx] = 0;
            if (grid.hasAnyCellEdgeAtIdx(idx)) grid.clearCellEdges(idx);
        }
}
function clearMapGenRectWalkable(state, config) {
    const grid = state.obstacleGrid;
    const boundsCol = config.boundsIdx % grid.cols;
    const boundsRow = (config.boundsIdx / grid.cols) | 0;
    const startCol = Math.max(0, boundsCol);
    const endCol = Math.min(grid.cols - 1, boundsCol + config.boundsCols - 1);
    const startRow = Math.max(0, boundsRow);
    const endRow = Math.min(grid.rows - 1, boundsRow + config.boundsRows - 1);
    clearRailStampCellBounds(grid, startCol, endCol, startRow, endRow);
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    return { startCol, endCol, startRow, endRow };
}
export function clearSnakeRegionPaddingStrip(state, paddingCells) {
    const { cavernConfig, playConfig } = state.editor;
    const grid = state.obstacleGrid;
    const padding = Math.max(0, Math.round(paddingCells));
    const innerRows = Math.max(2, playConfig.playAreaRows - padding);
    const topRows = Math.floor(innerRows / 2);
    const cavernCol = cavernConfig.boundsIdx % grid.cols;
    const cavernRow = (cavernConfig.boundsIdx / grid.cols) | 0;
    const targetRow = cavernRow + topRows;
    return clearMapGenRectWalkable(state, { boundsMode: "rect", boundsIdx: grid.idx(cavernCol, targetRow), boundsCols: cavernConfig.boundsCols, boundsRows: padding });
}
export async function generateLabRailDfsMaze(state, options = {}) {
    const { railConfig } = state.editor;
    const cellSize = gridSettings.cellSize;
    const stampBoundsAabb = getMapGenBoundsAabb(state.obstacleGrid, railConfig, cellSize);
    ensureLabObstacleGridCoverage(state, stampBoundsAabb);
    const grid = state.obstacleGrid;
    const { originIdx, cols, rows } = getMapGenBoundsStampExtent(grid, railConfig);
    const originCol = originIdx % grid.cols;
    const originRow = (originIdx / grid.cols) | 0;
    const startCol = Math.max(0, originCol);
    const endCol = Math.min(grid.cols - 1, originCol + cols - 1);
    const startRow = Math.max(0, originRow);
    const endRow = Math.min(grid.rows - 1, originRow + rows - 1);
    clearRailStampCellBounds(grid, startCol, endCol, startRow, endRow);
    const rails = bakeRailMazeDfs(
        { originCol, originRow, cols, rows },
        {
            railWallHeightLevel: options.railWallHeightLevel ?? railConfig.wallHeightLevel,
            railWallThicknessLevel: options.railWallThicknessLevel ?? railConfig.edgeThickness,
            corridorWidthMin: options.corridorWidthMin,
            corridorWidthMax: options.corridorWidthMax,
            extraLinkRatio: options.extraLinkRatio,
        },
        state.mapSeed,
    );
    stampGlobalRailWalls(state, rails, { commit: false });
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    const damageBounds = { startCol, endCol, startRow, endRow };
    const railProfile = railConfig.surfaceProfileId || "poolTableFelt";
    applyMapGenSurfaceProfile(state, railConfig, railProfile);
    await commitGridNavEdit(state, null, { fullNavSync: true });
    state.floorSeed = state.mapSeed;
    state.worldSurfaces.clearBakeCache();
}
export async function generateLabRailCaverns(state, { openBoundarySides = null } = {}) {
    const { railConfig } = state.editor;
    const cellSize = gridSettings.cellSize;
    const stampBounds = getMapGenBoundsAabb(state.obstacleGrid, railConfig, cellSize);
    ensureLabObstacleGridCoverage(state, stampBounds);
    const level = clampStampWallHeightLevel(railConfig.wallHeightLevel, state.worldSurfaces.settings);
    const thickness = railConfig.edgeThickness;
    const grid = state.obstacleGrid;
    const { originIdx, cols, rows } = getMapGenBoundsStampExtent(grid, railConfig);
    const originCol = originIdx % grid.cols;
    const originRow = (originIdx / grid.cols) | 0;
    const cellInBounds = (c, r) => {
        if (c < 0 || c >= grid.cols || r < 0 || r >= grid.rows) return false;
        return isIdxInMapGenBounds(railConfig, grid, c + r * grid.cols);
    };
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
            const in1 = cellInBounds(gc, gr - 1);
            const in2 = cellInBounds(gc, gr);
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
            const in1 = cellInBounds(gc - 1, gr);
            const in2 = cellInBounds(gc, gr);
            if (!in1 && !in2) vCells[lr * vCols + lc] = 0;
        }
    if (openBoundarySides?.west) for (let lr = 0; lr < vRows; lr++) vCells[lr * vCols] = 0;
    if (openBoundarySides?.east) {
        const lc = vCols - 1;
        for (let lr = 0; lr < vRows; lr++) vCells[lr * vCols + lc] = 0;
    }
    const startCol = Math.max(0, originCol);
    const endCol = Math.min(grid.cols - 1, originCol + cols - 1);
    const startRow = Math.max(0, originRow);
    const endRow = Math.min(grid.rows - 1, originRow + rows - 1);
    // 3. Clear existing walls & edges in target bounds
    for (let r = startRow; r <= endRow; r++)
        for (let c = startCol; c <= endCol; c++) {
            const idx = c + r * grid.cols;
            if (grid.grid[idx] !== 0) grid.grid[idx] = 0;
            if (grid.hasAnyCellEdgeAtIdx(idx)) grid.clearCellEdges(idx);
        }
    // 4. Stamp Horizontal Edges
    for (let lr = 0; lr < hRows; lr++)
        for (let lc = 0; lc < hCols; lc++) {
            if (hCells[lr * hCols + lc] !== 1) continue;
            const col = originCol + lc;
            const row = originRow + lr;
            if (row >= 0 && row < grid.rows && col >= 0 && col < grid.cols) setBoundary(grid, row * grid.cols + col, 0, { kind: "railWall", capHeightLevel: level, thicknessLevel: thickness });
            else if (row - 1 >= 0 && row - 1 < grid.rows && col >= 0 && col < grid.cols)
                setBoundary(grid, (row - 1) * grid.cols + col, 2, { kind: "railWall", capHeightLevel: level, thicknessLevel: thickness });
        }
    // 5. Stamp Vertical Edges
    for (let lr = 0; lr < vRows; lr++)
        for (let lc = 0; lc < vCols; lc++) {
            if (vCells[lr * vCols + lc] !== 1) continue;
            const col = originCol + lc;
            const row = originRow + lr;
            if (col >= 0 && col < grid.cols && row >= 0 && row < grid.rows) setBoundary(grid, row * grid.cols + col, 3, { kind: "railWall", capHeightLevel: level, thicknessLevel: thickness });
            else if (col - 1 >= 0 && col - 1 < grid.cols && row >= 0 && row < grid.rows)
                setBoundary(grid, row * grid.cols + col - 1, 1, { kind: "railWall", capHeightLevel: level, thicknessLevel: thickness });
        }
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    let damageBounds = { startCol, endCol, startRow, endRow };
    if (railConfig.boundsMode === "donut") {
        const innerR = getInnerRadiusCells(railConfig) * cellSize;
        const center = getMapGenBoundsCenterWorld(railConfig, cellSize);
        const cleared = clearStaticWallsInWorldCircle(state, center.x, center.y, innerR);
        if (cleared) damageBounds = unionCellBounds(damageBounds, cleared);
    }
    const railProfile = railConfig.surfaceProfileId || "poolTableFelt";
    applyMapGenSurfaceProfile(state, railConfig, railProfile);
    await commitGridNavEdit(state, null, { fullNavSync: true });
    state.floorSeed = state.mapSeed;
    state.worldSurfaces.clearBakeCache();
}
export async function generateLabRailMaze(state, options = {}) {
    registerMapGenBoundsGridExpansionListener(state);
    const config = options.boundsConfig ?? state.editor.railMazeConfig;
    const cellSize = gridSettings.cellSize;
    const stampBoundsAabb = getMapGenBoundsAabb(state.obstacleGrid, config, cellSize);
    ensureLabObstacleGridCoverage(state, stampBoundsAabb);
    const grid = state.obstacleGrid;
    const { originIdx, cols, rows } = getMapGenBoundsStampExtent(grid, config);
    const originCol = originIdx % grid.cols;
    const originRow = (originIdx / grid.cols) | 0;
    const startCol = Math.max(0, originCol);
    const endCol = Math.min(grid.cols - 1, originCol + cols - 1);
    const startRow = Math.max(0, originRow);
    const endRow = Math.min(grid.rows - 1, originRow + rows - 1);
    clearRailStampCellBounds(grid, startCol, endCol, startRow, endRow);
    const railWallHeightLevel = options.railWallHeightLevel ?? config.wallHeightLevel;
    const railWallThicknessLevel = options.railWallThicknessLevel ?? config.edgeThickness;
    const corridorWidthMin = options.corridorWidthMin ?? config.corridorWidthMin;
    const corridorWidthMax = options.corridorWidthMax ?? config.corridorWidthMax;
    const extraLinkRatio = options.extraLinkRatio ?? config.extraLinkRatio;
    let rails = bakeRailMazeDfs({ originCol, originRow, cols, rows }, { railWallHeightLevel, railWallThicknessLevel, corridorWidthMin, corridorWidthMax, extraLinkRatio }, state.mapSeed);
    if (config.boundsMode !== "rect")
        rails = rails.filter((wall) => {
            const idx = grid.idx(wall.col, wall.row);
            const inCell = isIdxInMapGenBounds(config, grid, idx);
            let inNeighbor = false;
            let nCol = wall.col;
            let nRow = wall.row;
            if (wall.side === 0) nRow--;
            else if (wall.side === 1) nCol++;
            else if (wall.side === 2) nRow++;
            else if (wall.side === 3) nCol--;
            if (nCol >= 0 && nCol < grid.cols && nRow >= 0 && nRow < grid.rows) {
                const nIdx = grid.idx(nCol, nRow);
                inNeighbor = isIdxInMapGenBounds(config, grid, nIdx);
            }
            return inCell || inNeighbor;
        });
    stampGlobalRailWalls(state, rails, { commit: false });
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    let damageBounds = { startCol, endCol, startRow, endRow };
    if (config.boundsMode === "donut") {
        const innerR = getInnerRadiusCells(config) * cellSize;
        const center = getMapGenBoundsCenterWorld(config, cellSize);
        const cleared = clearStaticWallsInWorldCircle(state, center.x, center.y, innerR);
        if (cleared) damageBounds = unionCellBounds(damageBounds, cleared);
    }
    await commitGridNavEdit(state, damageBounds);
    const boundsCol = config.boundsMode === "rect" ? config.boundsIdx % grid.cols : config.centerIdx % grid.cols;
    const boundsRow = config.boundsMode === "rect" ? (config.boundsIdx / grid.cols) | 0 : (config.centerIdx / grid.cols) | 0;
    const centerCol = config.boundsMode === "rect" ? boundsCol + Math.floor(config.boundsCols / 2) : boundsCol;
    const centerRow = config.boundsMode === "rect" ? boundsRow + Math.floor(config.boundsRows / 2) : boundsRow;
    const floodSeedBounds = options.floodSeedBounds ?? { boundsMode: "rect", boundsIdx: grid.idx(centerCol, centerRow), boundsCols: 1, boundsRows: 1 };
    const navWalkableIndex = options.navWalkableIndex ?? getNavWalkableCellIndex(state, config, floodSeedBounds);
    const beltPlan = planRailMazeCorridorBelts({ grid, navTopology: state.nav.topology, railConfig: config, navWalkableIndex, mapSeed: state.mapSeed });
    const { bounds: beltBounds } = stampGlobalRailMazeBelts(state, beltPlan.floorBelts);
    const { bounds: beltRailBounds } = stampGlobalRailWalls(state, beltPlan.beltRails, { commit: false });
    const railMazeProfile = config.surfaceProfileId || "cyberGrid";
    applyMapGenSurfaceProfile(state, config, railMazeProfile);
    await commitGridNavEdit(state, null, { fullNavSync: true });
    state.floorSeed = state.mapSeed;
    state.worldSurfaces.clearBakeCache();
}
export function applyMapGenSurfaceProfile(state, config, profileId) {
    const grid = state.obstacleGrid;
    const settings = state.worldSurfaces.settings;
    const cellsPerChunk = settings.cellsPerChunk;
    const chunkOf = (cell) => Math.floor(cell / cellsPerChunk);
    const ext = getMapGenBoundsStampExtent(grid, config);
    const minC = ext.originIdx % grid.cols;
    const minR = (ext.originIdx / grid.cols) | 0;
    const maxC = minC + ext.cols - 1;
    const maxR = minR + ext.rows - 1;
    grid.setChunkSurfaceProfileRange({ startCol: chunkOf(minC), endCol: chunkOf(maxC), startRow: chunkOf(minR), endRow: chunkOf(maxR) }, profileId, cellsPerChunk);
    grid.surfaceMaterialRevision++;
}
export function applyEditorRegionSurfaceProfiles(state) {
    const grid = state.obstacleGrid;
    const settings = state.worldSurfaces.settings;
    const cellsPerChunk = settings.cellsPerChunk;
    const chunkOf = (cell) => Math.floor(cell / cellsPerChunk);
    grid.surfaceMaterials.chunkProfileIds.clear();
    grid.surfaceMaterialRevision++;
    const cavern = state.editor.cavernConfig;
    const cavernExt = getMapGenBoundsStampExtent(grid, cavern);
    const cavernMinC = cavernExt.originIdx % grid.cols;
    const cavernMinR = (cavernExt.originIdx / grid.cols) | 0;
    const cavernMaxC = cavernMinC + cavernExt.cols - 1;
    const cavernMaxR = cavernMinR + cavernExt.rows - 1;
    const cavernProfile = cavern.surfaceProfileId || "tomatoGarden";
    grid.setChunkSurfaceProfileRange({ startCol: chunkOf(cavernMinC), endCol: chunkOf(cavernMaxC), startRow: chunkOf(cavernMinR), endRow: chunkOf(cavernMaxR) }, cavernProfile, cellsPerChunk);
    const rail = state.editor.railConfig;
    const railExt = getMapGenBoundsStampExtent(grid, rail);
    const railMinC = railExt.originIdx % grid.cols;
    const railMinR = (railExt.originIdx / grid.cols) | 0;
    const railMaxC = railMinC + railExt.cols - 1;
    const railMaxR = railMinR + railExt.rows - 1;
    const railProfile = rail.surfaceProfileId || "poolTableFelt";
    grid.setChunkSurfaceProfileRange({ startCol: chunkOf(railMinC), endCol: chunkOf(railMaxC), startRow: chunkOf(railMinR), endRow: chunkOf(railMaxR) }, railProfile, cellsPerChunk);
    const railMaze = state.editor.railMazeConfig;
    const railMazeExt = getMapGenBoundsStampExtent(grid, railMaze);
    const railMazeMinC = railMazeExt.originIdx % grid.cols;
    const railMazeMinR = (railMazeExt.originIdx / grid.cols) | 0;
    const railMazeMaxC = railMazeMinC + railMazeExt.cols - 1;
    const railMazeMaxR = railMazeMinR + railMazeExt.rows - 1;
    const railMazeProfile = railMaze.surfaceProfileId || "cyberGrid";
    grid.setChunkSurfaceProfileRange(
        { startCol: chunkOf(railMazeMinC), endCol: chunkOf(railMazeMaxC), startRow: chunkOf(railMazeMinR), endRow: chunkOf(railMazeMaxR) },
        railMazeProfile,
        cellsPerChunk,
    );
}
