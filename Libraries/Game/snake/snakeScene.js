import { applySandboxSceneSnapshot, SANDBOX_SCENE_SCHEMA_VERSION } from "../../Sandbox/sandboxSceneSnapshot.js";
import { walkableCellKey, pickWalkableCell, createNavWalkableAccess, collectNavWalkableCells } from "../../Procedural/Mazes/walkableCells.js";
import { cellChebyshevDistance } from "../../Navigation/steering/exploreSteering.js";
import { linkedChainOccupiedCellKeys, spawnLinkedBallChain } from "../../Sandbox/spawnLinkedBallChain.js";
import { spawnPlacedSandboxProp } from "../../Sandbox/sandboxPlacedSpawn.js";
import { SANDBOX_DEFAULT_FACTION } from "../../Sandbox/sandboxFaction.js";
import { withSeededRandom } from "../../Random/index.js";
import { applyPlayAreaConfig, generateLabCaverns, generateLabRailDfsMaze, clearSnakeRegionPaddingStrip } from "../../../Apps/Editor/world/mapWorld.js";
import { planRailMazeCorridorBelts } from "../../Procedural/Mazes/railMazeCorridorBelts.js";
import { stampGlobalRailMazeBelts } from "../../Procedural/Mazes/stampGlobalRailMazeBelts.js";
import { commitBoundaryEdit } from "../../Sandbox/boundaryEdit.js";
import { migrateMapGenBoundsForMode } from "../../Sandbox/mapGenBounds.js";
import { getSnakeGameConfig, resolveSnakeSegmentSpacing, resolveSnakeSpawnSpecs, resolveSnakeStartRadius } from "./snakeGameConfig.js";
import { ensureSnakeGoalIndex, registerSnakeGoal } from "./snakeGoalIndex.js";
import { pickNavWalkableBeltCellAny } from "./snakeBeltCells.js";
import { applySnakeChainTint, pickSnakeChainTintHex } from "./snakeChainColor.js";
import { applySnakeHeadGameplay, applySnakeSegmentGameplay } from "./snakeHeadGameplay.js";
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
function isValidSnakeChainAnchorCell(navWalkable, grid, anchorCell, { segmentCount, spacing, growDirX, growDirY, excludeKeys }) {
    const cells = chainAnchorOccupiedCells(grid, anchorCell, segmentCount, spacing, growDirX, growDirY);
    for (let i = 0; i < cells.length; i++) {
        const { col, row } = cells[i];
        if (!navWalkable.has(col, row)) return false;
        if (excludeKeys?.has(walkableCellKey(col, row))) return false;
    }
    return true;
}
function pickSnakeChainSpawnCellNearestTo(spawnPool, navWalkable, state, targetCol, targetRow, { segmentCount, spacing, growDirX, growDirY, excludeKeys }) {
    const grid = state.obstacleGrid;
    let best = null;
    let bestDist = Infinity;
    for (let i = 0; i < spawnPool.length; i++) {
        const cell = spawnPool[i];
        if (!isValidSnakeChainAnchorCell(navWalkable, grid, cell, { segmentCount, spacing, growDirX, growDirY, excludeKeys })) continue;
        const dist = cellChebyshevDistance(targetCol, targetRow, cell.col, cell.row);
        if (dist < bestDist) {
            bestDist = dist;
            best = cell;
        }
    }
    if (!best) throw new Error("No walkable snake spawn cell near map center");
    return best;
}
function pickSnakeChainSpawnCell(spawnPool, navWalkable, state, { segmentCount, spacing, growDirX, growDirY, excludeKeys, rng = Math.random }) {
    const grid = state.obstacleGrid;
    const valid = [];
    for (let i = 0; i < spawnPool.length; i++) {
        const cell = spawnPool[i];
        if (isValidSnakeChainAnchorCell(navWalkable, grid, cell, { segmentCount, spacing, growDirX, growDirY, excludeKeys })) valid.push(cell);
    }
    if (!valid.length) throw new Error("No walkable snake spawn cell with full chain clearance");
    return pickWalkableCell(valid, { excludeKeys, rng });
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
    commitBoundaryEdit(state, paddingBounds);
    state.worldSurfaces.invalidateGridBounds(paddingBounds, state);
    await state.navigation.onObstaclesChanged(paddingBounds);
    const playable = resolveSnakePlayableBounds(state);
    const floodSeed = resolveSnakeNavWalkableFloodSeedBounds(state);
    const navWalkable = collectNavWalkableCells(state, playable, floodSeed);
    const walkableKeys = new Set();
    for (let i = 0; i < navWalkable.length; i++) walkableKeys.add(walkableCellKey(navWalkable[i].col, navWalkable[i].row));
    const beltPlan = planRailMazeCorridorBelts({
        grid: state.obstacleGrid,
        gridNavContext: state.navigation.gridNavContext,
        railConfig,
        northReserveRows: cavern.openBoundaryRows ?? 3,
        walkableKeys,
        mapSeed: state.mapSeed,
    });
    const { bounds: beltBounds } = stampGlobalRailMazeBelts(state, beltPlan.floorBelts);
    if (beltBounds) {
        state.worldSurfaces.invalidateGridBounds(beltBounds, state);
        await state.navigation.onObstaclesChanged(beltBounds);
    }
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
export function resolveCenterSnakeSpawnAnchor(state, navWalkable, { segmentCount, excludeKeys = null }) {
    const config = getSnakeGameConfig();
    const centerCell = resolveSnakePlayableCenterCell(state);
    return pickSnakeChainSpawnCellNearestTo(navWalkable.cells(), navWalkable, state, centerCell.col, centerCell.row, {
        segmentCount,
        spacing: resolveSnakeSegmentSpacing(config, resolveSnakeStartRadius(config)),
        growDirX: config.growDirX,
        growDirY: config.growDirY,
        excludeKeys,
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
export function spawnGoalOrbOnOpenCell(state, navWalkable, { excludeKeys = null, faction = SANDBOX_DEFAULT_FACTION, rng = Math.random } = {}) {
    const config = getSnakeGameConfig();
    let cell = null;
    if ((config.beltFoodSpawnChance ?? 0) > 0 && rng() < config.beltFoodSpawnChance) cell = pickNavWalkableBeltCellAny(state.obstacleGrid, navWalkable, { excludeKeys, rng });
    if (!cell) cell = navWalkable.pick({ excludeKeys, rng });
    return spawnGoalOrbAtCell(state, cell, faction);
}
export function spawnSnakeChain(state, anchorCell, { excludeKeys = null, segmentCount, rng = Math.random } = {}) {
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
    const occupiedKeys = new Set(excludeKeys ?? []);
    const occupied = linkedChainOccupiedCellKeys(chain.members, state.obstacleGrid);
    for (const key of occupied) occupiedKeys.add(key);
    return { chain, tintHex, occupiedKeys };
}
export function spawnSnakeGoalPool(state, goalCount, navWalkable, { excludeKeys = null, rng = Math.random } = {}) {
    const keys = new Set(excludeKeys ?? []);
    const goals = [];
    for (let i = 0; i < goalCount; i++) {
        const goal = spawnGoalOrbOnOpenCell(state, navWalkable, { excludeKeys: keys, rng });
        goals.push(goal);
        const cell = state.obstacleGrid.worldToGrid(goal.x, goal.y);
        keys.add(walkableCellKey(cell.col, cell.row));
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
        let excludeKeys = null;
        const centerAnchor = resolveCenterSnakeSpawnAnchor(state, navWalkable, { segmentCount, excludeKeys });
        const centerPack = spawnSnakeChain(state, centerAnchor, { excludeKeys, segmentCount });
        snakes.push(centerPack);
        excludeKeys = centerPack.occupiedKeys;
        const shuffledSpawnCells = spawnCells.slice();
        shuffleInPlace(shuffledSpawnCells);
        for (let i = 1; i < specs.length; i++) {
            const spec = specs[i];
            const anchorCell = pickSnakeChainSpawnCell(shuffledSpawnCells, navWalkable, state, { ...chainSpawnParams, segmentCount: spec.segmentCount ?? segmentCount, excludeKeys });
            const pack = spawnSnakeChain(state, anchorCell, { excludeKeys, segmentCount: spec.segmentCount });
            snakes.push(pack);
            excludeKeys = pack.occupiedKeys;
        }
        goals = spawnSnakeGoalPool(state, config.goalCount, navWalkable, { excludeKeys });
    });
    return { snakes, goals, navWalkable };
}
