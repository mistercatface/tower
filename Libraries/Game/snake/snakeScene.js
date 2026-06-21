import { applySandboxSceneSnapshot, SANDBOX_SCENE_SCHEMA_VERSION } from "../../Sandbox/sandboxSceneSnapshot.js";
import { colRowToIndex, cellInRect } from "../../Spatial/grid/GridUtils.js";
import { getNavWalkableCellIndex, pickWalkableCell, createNavWalkableAccess, collectWalkableCells } from "../../Procedural/Mazes/walkableCells.js";
import { cellChebyshevDistance } from "../../Navigation/steering/exploreSteering.js";
import { linkedChainOccupiedCellIndices, spawnLinkedBallChain } from "../../Sandbox/spawnLinkedBallChain.js";
import { spawnPlacedSandboxProp } from "../../Sandbox/sandboxPlacedSpawn.js";
import { SANDBOX_DEFAULT_FACTION } from "../../Sandbox/sandboxFaction.js";
import { withSeededRandom } from "../../Random/index.js";
import { applyPlayAreaConfig, generateLabCaverns, generateLabRailDfsMaze, clearSnakeRegionPaddingStrip } from "../../../Apps/Editor/world/mapWorld.js";
import { planRailMazeCorridorBelts } from "../../Procedural/Mazes/railMazeCorridorBelts.js";
import { stampGlobalRailMazeBelts } from "../../Procedural/Mazes/stampGlobalRailMazeBelts.js";
import { commitGridNavEdit, commitGridNavEditUnion } from "../../Sandbox/gridNavEdit.js";
import { migrateMapGenBoundsForMode } from "../../Sandbox/mapGenBounds.js";
import { getSnakeGameConfig, resolveSnakeSegmentSpacing, resolveSnakeSpawnSpecs, resolveSnakeStartRadius } from "./snakeGameConfig.js";
import { ensureSnakeGoalIndex, registerSnakeGoal } from "./snakeGoalIndex.js";
import { notifySnakeGoalRelocated } from "./snakeGoalRelocate.js";
import { applySnakeChainTint, pickSnakeChainTintHex } from "./snakeChainColor.js";
import { applySnakeHeadGameplay, applySnakeSegmentGameplay } from "./snakeGameConfig.js";
export const SNAKE_CHAIN_EXPORT_TYPE = "snake_chain";
function buildEmptySandboxDoc(state) {
    const grid = state.obstacleGrid;
    return {
        schemaVersion: SANDBOX_SCENE_SCHEMA_VERSION,
        cellSize: grid.cellSize,
        origin: { minX: grid.minX, minY: grid.minY },
        cols: grid.cols,
        rows: grid.rows,
        voxels: [],
        railWalls: [],
        forcefields: [],
        floorBelts: [],
        powerSources: [],
        props: [],
        roomGraph: { nodes: [], links: [], nextNodeId: 0, nextLinkId: 0 },
    };
}
function chainAnchorOccupiedCells(grid, anchorCell, segmentCount, spacing, growDirX, growDirY) {
    const anchorWorld = grid.gridToWorld(anchorCell.col, anchorCell.row);
    const cells = [];
    for (let i = 0; i < segmentCount; i++) {
        const x = anchorWorld.x + i * spacing * growDirX;
        const y = anchorWorld.y + i * spacing * growDirY;
        cells.push(grid.worldToGrid(x, y));
    }
    return cells;
}
function isValidSnakeChainAnchorCell(navWalkable, grid, anchorCell, { segmentCount, spacing, growDirX, growDirY, excludeIndices }) {
    const cells = chainAnchorOccupiedCells(grid, anchorCell, segmentCount, spacing, growDirX, growDirY);
    for (let i = 0; i < cells.length; i++) {
        const { col, row } = cells[i];
        if (!navWalkable.has(col, row)) return false;
        if (excludeIndices?.has(colRowToIndex(col, row, grid.cols))) return false;
    }
    return true;
}
function pickSnakeChainSpawnCellNearestTo(spawnPool, navWalkable, state, targetCol, targetRow, { segmentCount, spacing, growDirX, growDirY, excludeIndices }) {
    const grid = state.obstacleGrid;
    let best = null;
    let bestDist = Infinity;
    for (let i = 0; i < spawnPool.length; i++) {
        const cell = spawnPool[i];
        if (!isValidSnakeChainAnchorCell(navWalkable, grid, cell, { segmentCount, spacing, growDirX, growDirY, excludeIndices })) continue;
        const dist = cellChebyshevDistance(targetCol, targetRow, cell.col, cell.row);
        if (dist < bestDist) {
            bestDist = dist;
            best = cell;
        }
    }
    if (!best) throw new Error("No walkable snake spawn cell near map center");
    return best;
}
function pickSnakeChainSpawnCell(spawnPool, navWalkable, state, { segmentCount, spacing, growDirX, growDirY, excludeIndices, rng = Math.random }) {
    const grid = state.obstacleGrid;
    const valid = [];
    for (let i = 0; i < spawnPool.length; i++) {
        const cell = spawnPool[i];
        if (isValidSnakeChainAnchorCell(navWalkable, grid, cell, { segmentCount, spacing, growDirX, growDirY, excludeIndices })) valid.push(cell);
    }
    if (!valid.length) throw new Error("No walkable snake spawn cell with full chain clearance");
    return pickWalkableCell(valid, { cols: grid.cols, excludeIndices, rng });
}
function shuffleInPlace(items) {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = items[i];
        items[i] = items[j];
        items[j] = tmp;
    }
}
function applySnakeSplitMapGenBounds(state, paddingCells) {
    const { cavernConfig, railConfig, playConfig } = state.editor;
    const padding = Math.max(0, Math.round(paddingCells));
    const baseCol = cavernConfig.boundsCol;
    const baseRow = cavernConfig.boundsRow;
    const cols = cavernConfig.boundsCols;
    const innerRows = Math.max(2, playConfig.playAreaRows - padding);
    const topRows = Math.floor(innerRows / 2);
    const bottomRows = innerRows - topRows;
    cavernConfig.boundsCol = baseCol;
    cavernConfig.boundsRow = baseRow;
    cavernConfig.boundsCols = cols;
    cavernConfig.boundsRows = topRows;
    migrateMapGenBoundsForMode(cavernConfig);
    railConfig.boundsCol = baseCol;
    railConfig.boundsRow = baseRow + topRows + padding;
    railConfig.boundsCols = cols;
    railConfig.boundsRows = bottomRows;
    migrateMapGenBoundsForMode(railConfig);
    state.sandbox.snakePlayableBounds = { boundsMode: "rect", boundsCol: baseCol, boundsRow: baseRow, boundsCols: cols, boundsRows: innerRows };
}
export function resolveSnakePlayableBounds(state) {
    return state.sandbox.snakePlayableBounds;
}
export async function generateSnakeSplitMap(state) {
    const config = getSnakeGameConfig();
    const cavern = config.cavern;
    await applyPlayAreaConfig(state);
    applySnakeSplitMapGenBounds(state, cavern.regionPaddingCells ?? 4);
    await applySandboxSceneSnapshot(state, buildEmptySandboxDoc(state));
    const { cavernConfig, railConfig } = state.editor;
    const prevCavernWallHeightLevel = cavernConfig.wallHeightLevel;
    const prevRailWallHeightLevel = railConfig.wallHeightLevel;
    const prevCavernFillChance = cavernConfig.fillChance;
    const prevCavernIterations = cavernConfig.iterations;
    const prevRailEdgeThickness = railConfig.edgeThickness;
    cavernConfig.wallHeightLevel = cavern.wallHeightLevel;
    railConfig.wallHeightLevel = config.rail.wallHeightLevel;
    if (cavern.fillChance != null) cavernConfig.fillChance = cavern.fillChance;
    if (cavern.iterations != null) cavernConfig.iterations = cavern.iterations;
    if (config.rail.edgeThickness != null) railConfig.edgeThickness = config.rail.edgeThickness;
    await generateLabCaverns(state, { openBoundarySides: { south: true }, openBoundaryRows: cavern.openBoundaryRows ?? 2 });
    const rail = config.rail;
    await generateLabRailDfsMaze(state, {
        railWallHeightLevel: rail.wallHeightLevel,
        railWallThicknessLevel: rail.edgeThickness,
        corridorWidthMin: rail.corridorWidthMin ?? 1,
        corridorWidthMax: rail.corridorWidthMax ?? 2,
        extraLinkRatio: rail.extraLinkRatio,
        northReserveRows: cavern.openBoundaryRows ?? 3,
    });
    const paddingBounds = clearSnakeRegionPaddingStrip(state, cavern.regionPaddingCells ?? 4);
    const playable = resolveSnakePlayableBounds(state);
    const floodSeed = resolveSnakeNavWalkableFloodSeedBounds(state);
    const navWalkableIndex = getNavWalkableCellIndex(state, playable, floodSeed);
    const beltPlan = planRailMazeCorridorBelts({
        grid: state.obstacleGrid,
        navTopology: state.nav.topology,
        railConfig,
        northReserveRows: cavern.openBoundaryRows ?? 3,
        navWalkableIndex,
        mapSeed: state.mapSeed,
    });
    const { bounds: beltBounds } = stampGlobalRailMazeBelts(state, beltPlan.floorBelts);
    await commitGridNavEditUnion(state, paddingBounds, beltBounds);
    cavernConfig.wallHeightLevel = prevCavernWallHeightLevel;
    railConfig.wallHeightLevel = prevRailWallHeightLevel;
    cavernConfig.fillChance = prevCavernFillChance;
    cavernConfig.iterations = prevCavernIterations;
    railConfig.edgeThickness = prevRailEdgeThickness;
}
export function resolveSnakeNavWalkableFloodSeedBounds(state) {
    const playable = resolveSnakePlayableBounds(state);
    const globalCol = playable.boundsCol + Math.floor(playable.boundsCols / 2);
    const globalRow = playable.boundsRow + Math.floor(playable.boundsRows / 2);
    return { boundsMode: "rect", boundsCol: globalCol, boundsRow: globalRow, boundsCols: 1, boundsRows: 1 };
}
export function resolveSnakePlayableCenterCell(state) {
    const seed = resolveSnakeNavWalkableFloodSeedBounds(state);
    const cellSize = state.obstacleGrid.cellSize;
    return state.obstacleGrid.worldToGrid(seed.boundsCol * cellSize, seed.boundsRow * cellSize);
}
export function resolveCenterSnakeSpawnAnchor(state, navWalkable, { segmentCount, excludeIndices = null }) {
    const config = getSnakeGameConfig();
    const centerCell = resolveSnakePlayableCenterCell(state);
    return pickSnakeChainSpawnCellNearestTo(navWalkable.cells(), navWalkable, state, centerCell.col, centerCell.row, {
        segmentCount,
        spacing: resolveSnakeSegmentSpacing(config, resolveSnakeStartRadius(config)),
        growDirX: config.growDirX,
        growDirY: config.growDirY,
        excludeIndices,
    });
}
async function spawnSnakeCavernMap(state) {
    await generateSnakeSplitMap(state);
}
export function spawnGoalOrb(state, worldX, worldY, faction = SANDBOX_DEFAULT_FACTION) {
    const prop = spawnPlacedSandboxProp(state, worldX, worldY, getSnakeGameConfig().goalPropId, faction);
    const index = ensureSnakeGoalIndex(state);
    if (index) registerSnakeGoal(index, prop, state.obstacleGrid);
    return prop;
}
export function spawnGoalOrbAtCell(state, cell, faction = SANDBOX_DEFAULT_FACTION) {
    const { x, y } = state.obstacleGrid.gridToWorld(cell.col, cell.row);
    return spawnGoalOrb(state, x, y, faction);
}
/**
 * @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {{ cells(): { col: number, row: number }[] }} navWalkable
 * @param {{ col: number, row: number }} origin
 * @param {number} minTiles
 */
export function pickNavWalkableCellAwayFrom(grid, navWalkable, origin, minTiles, { excludeIndices = null, rng = Math.random } = {}) {
    const cols = grid.cols;
    const cells = navWalkable.cells();
    const candidates = [];
    for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        if (excludeIndices?.has(colRowToIndex(cell.col, cell.row, cols))) continue;
        if (cellChebyshevDistance(origin.col, origin.row, cell.col, cell.row) < minTiles) continue;
        candidates.push(cell);
    }
    if (!candidates.length) return null;
    return pickWalkableCell(candidates, { cols, excludeIndices, rng });
}
/** Pick a nav-walkable cell at least goalRelocateMinTiles from origin; fall back to any open cell. */
export function pickGoalRelocateCell(state, navWalkable, origin, { excludeIndices = null, rng = Math.random } = {}) {
    const config = getSnakeGameConfig();
    const grid = state.obstacleGrid;
    const cols = grid.cols;
    const isOrigin = (cell) => cell.col === origin.col && cell.row === origin.row;
    const pickAway = (cells, minTiles) => {
        const pool = { cells: () => cells };
        return pickNavWalkableCellAwayFrom(grid, pool, origin, minTiles, { excludeIndices, rng });
    };
    let cell = pickAway(navWalkable.cells(), config.goalRelocateMinTiles);
    if (!cell && config.goalRelocateFallbackMinTiles < config.goalRelocateMinTiles) cell = pickAway(navWalkable.cells(), config.goalRelocateFallbackMinTiles);
    if (!cell) cell = navWalkable.pick({ excludeIndices, rng });
    if (!cell) {
        const boundsConfig = state.sandbox?.snakePlayableBounds ?? state.editor?.cavernConfig;
        const open = collectWalkableCells(state, boundsConfig);
        cell = pickAway(open, config.goalRelocateFallbackMinTiles);
        if (!cell) cell = pickWalkableCell(open, { cols, excludeIndices, rng });
    }
    if (!cell || isOrigin(cell)) {
        const cells = navWalkable.cells();
        for (let i = 0; i < cells.length; i++) {
            const candidate = cells[i];
            if (isOrigin(candidate)) continue;
            if (excludeIndices?.has(colRowToIndex(candidate.col, candidate.row, cols))) continue;
            cell = candidate;
            break;
        }
    }
    if (!cell || isOrigin(cell)) {
        const cardinals = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
        ];
        for (let i = 0; i < cardinals.length; i++) {
            const col = origin.col + cardinals[i][0];
            const row = origin.row + cardinals[i][1];
            if (!cellInRect(col, row, cols, grid.rows)) continue;
            if (grid.isBlocked(col, row)) continue;
            if (excludeIndices?.has(colRowToIndex(col, row, cols))) continue;
            cell = { col, row };
            break;
        }
    }
    return cell;
}
/** Move an existing goal orb to a grid cell, refresh the spatial index, and retarget other seekers. */
export function relocateGoalOrb(state, goal, cell, { skipHeadId = null } = {}) {
    if (!goal || !cell) return null;
    const { x, y } = state.obstacleGrid.gridToWorld(cell.col, cell.row);
    goal.x = x;
    goal.y = y;
    const index = ensureSnakeGoalIndex(state);
    if (index) registerSnakeGoal(index, goal, state.obstacleGrid);
    notifySnakeGoalRelocated(state, goal, skipHeadId);
    return goal;
}
export function spawnGoalOrbOnOpenCell(state, navWalkable, { excludeIndices = null, faction = SANDBOX_DEFAULT_FACTION, rng = Math.random } = {}) {
    let cell = navWalkable.pick({ excludeIndices, rng });
    if (!cell) {
        const boundsConfig = state.sandbox?.snakePlayableBounds ?? state.editor?.cavernConfig;
        const open = collectWalkableCells(state, boundsConfig);
        cell = pickWalkableCell(open, { cols: state.obstacleGrid.cols, excludeIndices, rng });
    }
    if (!cell) return null;
    return spawnGoalOrbAtCell(state, cell, faction);
}
export function spawnSnakeChain(state, anchorCell, { excludeIndices = null, segmentCount, rng = Math.random } = {}) {
    const config = getSnakeGameConfig();
    const startRadius = resolveSnakeStartRadius(config);
    const resolvedSegmentCount = segmentCount ?? config.segmentCount;
    const tintHex = pickSnakeChainTintHex(rng);
    const chain = spawnLinkedBallChain(state, anchorCell, {
        segmentCount: resolvedSegmentCount,
        spacing: resolveSnakeSegmentSpacing(config, startRadius),
        segmentRadius: startRadius,
        linkSlack: config.linkSlack,
        ballType: config.segmentPropId,
        headBallType: config.headPropId,
        growDirX: config.growDirX,
        growDirY: config.growDirY,
        exportType: SNAKE_CHAIN_EXPORT_TYPE,
    });
    applySnakeChainTint(chain.members, tintHex);
    applySnakeHeadGameplay(chain.head);
    for (let i = 1; i < chain.members.length; i++) applySnakeSegmentGameplay(chain.members[i]);
    const occupiedIndices = new Set(excludeIndices ?? []);
    const occupied = linkedChainOccupiedCellIndices(chain.members, state.obstacleGrid);
    for (const idx of occupied) occupiedIndices.add(idx);
    return { chain, tintHex, occupiedIndices };
}
export function spawnSnakeGoalPool(state, goalCount, navWalkable, { excludeIndices = null, rng = Math.random } = {}) {
    const indices = new Set(excludeIndices ?? []);
    const goals = [];
    for (let i = 0; i < goalCount; i++) {
        const goal = spawnGoalOrbOnOpenCell(state, navWalkable, { excludeIndices: indices, rng });
        if (!goal) break;
        goals.push(goal);
        const cell = state.obstacleGrid.worldToGrid(goal.x, goal.y);
        indices.add(colRowToIndex(cell.col, cell.row, state.obstacleGrid.cols));
    }
    return goals;
}
export async function spawnSnakeCavernScene(state) {
    const config = getSnakeGameConfig();
    await spawnSnakeCavernMap(state);
    const navWalkable = createNavWalkableAccess(state, resolveSnakePlayableBounds(state), { floodSeedBounds: resolveSnakeNavWalkableFloodSeedBounds(state) });
    navWalkable.rebake();
    const spawnCells = navWalkable.cells();
    const snakes = [];
    let goals = [];
    withSeededRandom(state.mapSeed + config.cavern.mapSeedOffset, () => {
        const specs = resolveSnakeSpawnSpecs(config);
        const segmentCount = config.segmentCount;
        const spacing = resolveSnakeSegmentSpacing(config, resolveSnakeStartRadius(config));
        const growDirX = config.growDirX;
        const growDirY = config.growDirY;
        const chainSpawnParams = { segmentCount, spacing, growDirX, growDirY };
        let excludeIndices = null;
        const centerAnchor = resolveCenterSnakeSpawnAnchor(state, navWalkable, { segmentCount, excludeIndices });
        const centerPack = spawnSnakeChain(state, centerAnchor, { excludeIndices, segmentCount });
        snakes.push(centerPack);
        excludeIndices = centerPack.occupiedIndices;
        const shuffledSpawnCells = spawnCells.slice();
        shuffleInPlace(shuffledSpawnCells);
        for (let i = 1; i < specs.length; i++) {
            const spec = specs[i];
            const anchorCell = pickSnakeChainSpawnCell(shuffledSpawnCells, navWalkable, state, { ...chainSpawnParams, segmentCount: spec.segmentCount ?? segmentCount, excludeIndices });
            const pack = spawnSnakeChain(state, anchorCell, { excludeIndices, segmentCount: spec.segmentCount });
            snakes.push(pack);
            excludeIndices = pack.occupiedIndices;
        }
        goals = spawnSnakeGoalPool(state, config.goalCount, navWalkable, { excludeIndices });
    });
    return { snakes, goals, navWalkable };
}
