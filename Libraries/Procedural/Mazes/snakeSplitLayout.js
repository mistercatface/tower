import { gridSettings } from "../../../Config/world.js";
import { withSeededRandom } from "../../Random/index.js";
import { createNavRuntime, terminateWorkerNavigation } from "../../Navigation/WorkerNavigationFactory.js";
import { forEachGlobalCellInMapGenBounds, getMapGenBoundsAabb, getMapGenBoundsStampExtent, migrateMapGenBoundsForMode } from "../../Sandbox/mapGenBounds.js";
import { cellInRect } from "../../Spatial/grid/GridUtils.js";
import { WorldObstacleGrid } from "../../Spatial/grid/WorldObstacleGrid.js";
import { clampStampWallHeightLevel } from "../../WorldSurface/stampWallHeight.js";
import { WORLD_SURFACE_DEFAULTS } from "../../../Config/world.js";
import { getNavWalkableCellIndex } from "./walkableCells.js";
import { generateCavernOccupancy } from "./cavernOccupancy.js";
import { bakeRailMazeDfs } from "./railMazeDfs.js";
import { planRailMazeCorridorBelts } from "./railMazeCorridorBelts.js";
import { stampFloorBeltsOnGrid } from "./stampGlobalRailMazeBelts.js";
export function centerPlayAreaBounds(playAreaCols, playAreaRows) {
    return { boundsMode: "rect", boundsCol: 0, boundsRow: 0, boundsCols: playAreaCols, boundsRows: playAreaRows };
}
export function resolveSnakeSplitZones(playAreaBounds, regionPaddingCells) {
    const padding = Math.max(0, Math.round(regionPaddingCells));
    const baseCol = playAreaBounds.boundsCol;
    const baseRow = playAreaBounds.boundsRow;
    const cols = playAreaBounds.boundsCols;
    const innerRows = Math.max(2, playAreaBounds.boundsRows - padding);
    const topRows = Math.floor(innerRows / 2);
    const bottomRows = innerRows - topRows;
    const cavernConfig = { boundsMode: "rect", boundsCol: baseCol, boundsRow: baseRow, boundsCols: cols, boundsRows: topRows };
    const paddingConfig = { boundsMode: "rect", boundsCol: baseCol, boundsRow: baseRow + topRows, boundsCols: cols, boundsRows: padding };
    const railConfig = { boundsMode: "rect", boundsCol: baseCol, boundsRow: baseRow + topRows + padding, boundsCols: cols, boundsRows: bottomRows };
    const playableBounds = { boundsMode: "rect", boundsCol: baseCol, boundsRow: baseRow, boundsCols: cols, boundsRows: innerRows };
    migrateMapGenBoundsForMode(cavernConfig);
    migrateMapGenBoundsForMode(paddingConfig);
    migrateMapGenBoundsForMode(railConfig);
    migrateMapGenBoundsForMode(playableBounds);
    return { cavernConfig, paddingConfig, railConfig, playableBounds, padding, topRows, bottomRows };
}
export function resolveSnakeNavWalkableFloodSeedBounds(playableBounds) {
    const globalCol = playableBounds.boundsCol + Math.floor(playableBounds.boundsCols / 2);
    const globalRow = playableBounds.boundsRow + Math.floor(playableBounds.boundsRows / 2);
    return { boundsMode: "rect", boundsCol: globalCol, boundsRow: globalRow, boundsCols: 1, boundsRows: 1 };
}
function clearRectWalkable(grid, config) {
    const cellSize = grid.cellSize;
    const { originCol, originRow, cols, rows } = getMapGenBoundsStampExtent(config);
    const baseCol = grid.worldCol(originCol * cellSize);
    const baseRow = grid.worldRow(originRow * cellSize);
    const startCol = Math.max(0, baseCol);
    const endCol = Math.min(grid.cols - 1, baseCol + cols - 1);
    const startRow = Math.max(0, baseRow);
    const endRow = Math.min(grid.rows - 1, baseRow + rows - 1);
    for (let r = startRow; r <= endRow; r++)
        for (let c = startCol; c <= endCol; c++) {
            grid.grid[c + r * grid.cols] = 0;
            if (grid.edgeStore.hasAnyAtIdx(c + r * grid.cols)) grid.clearCellEdges(c, r);
        }
    return { startCol, endCol, startRow, endRow };
}
function clearRailZoneNorthStrip(grid, startCol, endCol, startRow, stripRows) {
    const depth = Math.max(1, Math.round(stripRows));
    const lastRow = Math.min(grid.rows - 1, startRow + depth - 1);
    for (let r = startRow; r <= lastRow; r++)
        for (let c = startCol; c <= endCol; c++) {
            grid.grid[c + r * grid.cols] = 0;
            grid.clearCellEdges(c, r);
        }
    return { startCol, endCol, startRow, endRow: lastRow };
}
function stampRailsOnGrid(grid, rails, wallHeightLevel, edgeThickness) {
    const cellSize = grid.cellSize;
    const level = clampStampWallHeightLevel(wallHeightLevel, { maxWallHeightLevel: WORLD_SURFACE_DEFAULTS.maxWallHeightLevel });
    const thickness = edgeThickness;
    for (let i = 0; i < rails.length; i++) {
        const wall = rails[i];
        const col = grid.worldCol(wall.col * cellSize);
    const row = grid.worldRow(wall.row * cellSize);
        if (!cellInRect(col, row, grid.cols, grid.rows)) continue;
        grid.stampCellEdge(col, row, wall.side, level, thickness);
    }
}
/** @param {import("../../Navigation/NavRuntime.js").NavRuntime} nav */
export async function applySnakeSplitLayoutToGrid(grid, layout, nav) {
    const cellSize = grid.cellSize;
    const { cavernConfig, paddingConfig, railConfig, playableBounds } = layout.zones;
    const cavernStamp = layout.cavern;
    const wallLevel = layout.cavernWallHeightLevel;
    grid.expandToCoverAabb(getMapGenBoundsAabb(playableBounds, cellSize));
    grid.stampStaticWalls(cavernStamp.originCol, cavernStamp.originRow, cavernStamp.cols, cavernStamp.rows, cavernStamp.cells, { additive: true, heightLevel: wallLevel });
    const { originCol, originRow, cols, rows } = getMapGenBoundsStampExtent(railConfig);
    const railBaseCol = grid.worldCol(originCol * cellSize);
    const railBaseRow = grid.worldRow(originRow * cellSize);
    const railStartCol = Math.max(0, railBaseCol);
    const railEndCol = Math.min(grid.cols - 1, railBaseCol + cols - 1);
    const railStartRow = Math.max(0, railBaseRow);
    const railEndRow = Math.min(grid.rows - 1, railBaseRow + rows - 1);
    for (let r = railStartRow; r <= railEndRow; r++)
        for (let c = railStartCol; c <= railEndCol; c++) {
            grid.grid[c + r * grid.cols] = 0;
            if (grid.edgeStore.hasAnyAtIdx(c + r * grid.cols)) grid.clearCellEdges(c, r);
        }
    stampRailsOnGrid(grid, layout.rails, layout.railWallHeightLevel, layout.railEdgeThickness);
    clearRailZoneNorthStrip(grid, railStartCol, railEndCol, railStartRow, layout.northReserveRows);
    clearRectWalkable(grid, paddingConfig);
    const damageBounds = { startCol: railStartCol, endCol: railEndCol, startRow: railStartRow, endRow: railEndRow };
    await nav.syncTopology(damageBounds, grid);
    return { playableBounds, floodSeedBounds: resolveSnakeNavWalkableFloodSeedBounds(playableBounds), cavernConfig, paddingConfig, railConfig };
}
export function bakeSnakeSplitLayout({ mapSeed, playAreaCols, playAreaRows, playAreaBounds = null, cavern = {}, rail = {} }) {
    const bounds = playAreaBounds ?? centerPlayAreaBounds(playAreaCols, playAreaRows);
    const regionPaddingCells = cavern.regionPaddingCells ?? 4;
    const zones = resolveSnakeSplitZones(bounds, regionPaddingCells);
    const cavernConfig = { ...zones.cavernConfig, fillChance: cavern.fillChance ?? 0.48, iterations: cavern.iterations ?? 4, wallHeightLevel: cavern.wallHeightLevel ?? 1 };
    const railConfig = { ...zones.railConfig, wallHeightLevel: rail.wallHeightLevel ?? 1, edgeThickness: rail.edgeThickness ?? 1 };
    const openBoundaryRows = cavern.openBoundaryRows ?? 2;
    const northReserveRows = cavern.openBoundaryRows ?? 3;
    let cavernStamp = null;
    withSeededRandom(mapSeed, () => {
        cavernStamp = generateCavernOccupancy(cavernConfig, { openBoundarySides: { south: true }, openBoundaryRows });
    });
    const railStampExtent = getMapGenBoundsStampExtent(railConfig);
    const rails = bakeRailMazeDfs(
        railStampExtent,
        {
            railWallHeightLevel: rail.wallHeightLevel ?? 1,
            railWallThicknessLevel: rail.edgeThickness ?? 1,
            corridorWidthMin: rail.corridorWidthMin ?? 1,
            corridorWidthMax: rail.corridorWidthMax ?? 2,
            extraLinkRatio: rail.extraLinkRatio ?? 0.25,
            northReserveRows,
        },
        mapSeed,
    );
    return {
        mapSeed,
        playAreaBounds: bounds,
        zones,
        cavern: cavernStamp,
        rails,
        northReserveRows,
        cavernWallHeightLevel: clampStampWallHeightLevel(cavern.wallHeightLevel ?? 1, { maxWallHeightLevel: WORLD_SURFACE_DEFAULTS.maxWallHeightLevel }),
        railWallHeightLevel: rail.wallHeightLevel ?? 1,
        railEdgeThickness: rail.edgeThickness ?? 1,
    };
}
export async function bakeSnakeSplitLayoutPreview({ mapSeed, playAreaCols, playAreaRows, playAreaBounds = null, cavern = {}, rail = {} }) {
    const layout = bakeSnakeSplitLayout({ mapSeed, playAreaCols, playAreaRows, playAreaBounds, cavern, rail });
    const cellSize = gridSettings.cellSize;
    const grid = new WorldObstacleGrid(cellSize);
    grid.rebuildFixed((playAreaCols * cellSize) / 2, (playAreaRows * cellSize) / 2, playAreaCols * cellSize, playAreaRows * cellSize);
    const nav = createNavRuntime(grid);
    try {
        const applied = await applySnakeSplitLayoutToGrid(grid, layout, nav);
        const walkableState = { obstacleGrid: grid, nav, sandbox: {}, editor: { cavernConfig: applied.playableBounds } };
        const navWalkableIndex = getNavWalkableCellIndex(walkableState, applied.playableBounds, applied.floodSeedBounds);
        const beltPlan = planRailMazeCorridorBelts({
            grid,
            navTopology: nav.topology,
            railConfig: applied.railConfig,
            northReserveRows: layout.northReserveRows,
            navWalkableIndex,
            mapSeed: layout.mapSeed,
        });
        stampFloorBeltsOnGrid(grid, beltPlan.floorBelts);
        await nav.syncTopology(null, grid);
        return { layout, grid, navTopology: nav.topology, navWalkableIndex, beltPlan, ...applied };
    } finally {
        terminateWorkerNavigation(nav);
    }
}
export function globalCellFromGrid(grid, col, row) {
    const cellSize = grid.cellSize;
    const x = grid.gridCenterX(col);
    const y = grid.gridCenterY(row);
    return { globalCol: Math.round(x / cellSize), globalRow: Math.round(y / cellSize) };
}
export function forEachPlayableGlobalCell(playableBounds, fn) {
    forEachGlobalCellInMapGenBounds(playableBounds, fn);
}
