import { applySandboxSceneSnapshot, SANDBOX_SCENE_SCHEMA_VERSION } from "../../Sandbox/sandboxSceneSnapshot.js";
import { walkableCellKey, pickWalkableCell, createNavWalkableAccess } from "../../Procedural/Mazes/walkableCells.js";
import { linkedChainOccupiedCellKeys, spawnLinkedBallChain } from "../../Sandbox/spawnLinkedBallChain.js";
import { spawnPlacedSandboxProp } from "../../Sandbox/sandboxPlacedSpawn.js";
import { SANDBOX_DEFAULT_FACTION } from "../../Sandbox/sandboxFaction.js";
import { withSeededRandom } from "../../Random/index.js";
import { applyPlayAreaConfig, generateLabCaverns, generateLabRailDfsMaze, clearSnakeRegionPaddingStrip } from "../../../Apps/Editor/world/mapWorld.js";
import { commitBoundaryEdit } from "../../Sandbox/boundaryEdit.js";
import { migrateMapGenBoundsForMode } from "../../Sandbox/mapGenBounds.js";
import { getSnakeGameConfig, resolveSnakeSegmentSpacing, resolveSnakeSpawnSpecs, resolveSnakeStartRadius } from "./snakeGameConfig.js";
import { applySnakeChainTint, pickSnakeChainTintHex } from "./snakeChainColor.js";
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
    cavernConfig.wallHeightLevel = prevCavernWallHeightLevel;
    railConfig.wallHeightLevel = prevRailWallHeightLevel;
    cavernConfig.fillChance = prevCavernFillChance;
    cavernConfig.iterations = prevCavernIterations;
    railConfig.edgeThickness = prevRailEdgeThickness;
}
function resolveSnakePlayerSpawnBounds(state) {
    const { cavernConfig, railConfig, playConfig } = state.editor;
    const playRows = playConfig.playAreaRows;
    const quarterStart = Math.floor(playRows * 0.75);
    return { boundsMode: "rect", boundsCol: railConfig.boundsCol, boundsRow: cavernConfig.boundsRow + quarterStart, boundsCols: railConfig.boundsCols, boundsRows: playRows - quarterStart };
}
async function spawnSnakeCavernMap(state) {
    await generateSnakeSplitMap(state);
}
export function spawnGoalOrb(state, worldX, worldY, faction = SANDBOX_DEFAULT_FACTION) {
    return spawnPlacedSandboxProp(state, worldX, worldY, getSnakeGameConfig().goalPropId, faction);
}
export function spawnGoalOrbAtCell(state, cell, faction = SANDBOX_DEFAULT_FACTION) {
    const { x, y } = state.obstacleGrid.gridToWorld(cell.col, cell.row);
    return spawnGoalOrb(state, x, y, faction);
}
export function spawnGoalOrbOnOpenCell(state, navWalkable, { excludeKeys = null, faction = SANDBOX_DEFAULT_FACTION, rng = Math.random } = {}) {
    const cell = navWalkable.pick({ excludeKeys, rng });
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
    const navWalkable = createNavWalkableAccess(state, resolveSnakePlayableBounds(state));
    navWalkable.rebake();
    const cavernCells = navWalkable.cells();
    const playerSpawnBounds = resolveSnakePlayerSpawnBounds(state);
    const playerCells = navWalkable.filterInBounds(playerSpawnBounds);
    const snakes = [];
    let goals = [];
    const playerIndex = config.playerSnakeIndex ?? 0;
    withSeededRandom(state.mapSeed + config.cavern.mapSeedOffset, () => {
        shuffleInPlace(cavernCells);
        let excludeKeys = null;
        const specs = resolveSnakeSpawnSpecs(config);
        for (let i = 0; i < specs.length; i++) {
            const spec = specs[i];
            const spawnPool = i === playerIndex ? playerCells : cavernCells;
            const anchorCell = pickWalkableCell(spawnPool, { excludeKeys, rng: () => (i * 0.13) % 1 });
            const pack = spawnSnakeChain(state, anchorCell, { excludeKeys, segmentCount: spec.segmentCount });
            snakes.push({ ...pack, cameraFollow: spec.cameraFollow });
            excludeKeys = pack.occupiedKeys;
        }
        goals = spawnSnakeGoalPool(state, config.goalCount, navWalkable, { excludeKeys });
    });
    return { snakes, goals, navWalkable };
}
