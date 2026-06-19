import { applySandboxSceneSnapshot, SANDBOX_SCENE_SCHEMA_VERSION } from "../../Sandbox/sandboxSceneSnapshot.js";
import { cavernCellKey, collectOpenCavernCells, pickOpenCavernCell } from "../../Sandbox/cavernFloorCells.js";
import { linkedChainOccupiedCellKeys, spawnLinkedBallChain } from "../../Sandbox/spawnLinkedBallChain.js";
import { spawnPlacedSandboxProp } from "../../Sandbox/sandboxPlacedSpawn.js";
import { SANDBOX_DEFAULT_FACTION } from "../../Sandbox/sandboxFaction.js";
import { withSeededRandom } from "../../Random/index.js";
import { applyPlayAreaConfig, generateLabCaverns, generateLabRailCaverns } from "../../../Apps/Editor/world/mapWorld.js";
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
    const prevRailFillChance = railConfig.fillChance;
    const prevRailIterations = railConfig.iterations;
    cavernConfig.wallHeightLevel = cavern.wallHeightLevel;
    railConfig.wallHeightLevel = config.rail.wallHeightLevel;
    if (cavern.fillChance != null) cavernConfig.fillChance = cavern.fillChance;
    if (cavern.iterations != null) cavernConfig.iterations = cavern.iterations;
    if (config.rail.fillChance != null) railConfig.fillChance = config.rail.fillChance;
    if (config.rail.iterations != null) railConfig.iterations = config.rail.iterations;
    await generateLabCaverns(state, { openBoundarySides: { south: true }, openBoundaryRows: cavern.openBoundaryRows ?? 2 });
    await generateLabRailCaverns(state, { openBoundarySides: { north: true } });
    cavernConfig.wallHeightLevel = prevCavernWallHeightLevel;
    railConfig.wallHeightLevel = prevRailWallHeightLevel;
    cavernConfig.fillChance = prevCavernFillChance;
    cavernConfig.iterations = prevCavernIterations;
    railConfig.fillChance = prevRailFillChance;
    railConfig.iterations = prevRailIterations;
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
export function spawnGoalOrbOnOpenCell(state, { excludeKeys = null, faction = SANDBOX_DEFAULT_FACTION, rng = Math.random } = {}) {
    const openCells = collectOpenCavernCells(state);
    const cell = pickOpenCavernCell(openCells, { excludeKeys, rng });
    if (!cell) throw new Error("Cavern has no open floor cell for goal orb");
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
export function spawnSnakeGoalPool(state, goalCount, { excludeKeys = null, rng = Math.random } = {}) {
    const keys = new Set(excludeKeys ?? []);
    const goals = [];
    for (let i = 0; i < goalCount; i++) {
        const goal = spawnGoalOrbOnOpenCell(state, { excludeKeys: keys, rng });
        goals.push(goal);
        const cell = state.obstacleGrid.worldToGrid(goal.x, goal.y);
        keys.add(cavernCellKey(cell.col, cell.row));
    }
    return goals;
}
export async function spawnSnakeCavernScene(state) {
    const config = getSnakeGameConfig();
    await spawnSnakeCavernMap(state);
    const cavernCells = collectOpenCavernCells(state);
    if (!cavernCells.length) throw new Error("Cavern has no open floor cells for snake placement");
    const playerSpawnBounds = resolveSnakePlayerSpawnBounds(state);
    const playerCells = collectOpenCavernCells(state, playerSpawnBounds);
    if (!playerCells.length) throw new Error("Lower map quarter has no open floor cell for player spawn");
    const snakes = [];
    let goals = [];
    const playerIndex = config.playerSnakeIndex ?? 0;
    withSeededRandom(state.mapSeed + config.cavern.mapSeedOffset, () => {
        shuffleInPlace(cavernCells);
        let excludeKeys = null;
        const specs = resolveSnakeSpawnSpecs(config);
        for (let i = 0; i < specs.length; i++) {
            const spec = specs[i];
            const pool = i === playerIndex ? playerCells : cavernCells;
            const anchorCell = pickOpenCavernCell(pool, { excludeKeys });
            if (!anchorCell) throw new Error(`No open floor cell for snake ${i + 1}`);
            const pack = spawnSnakeChain(state, anchorCell, { excludeKeys, segmentCount: spec.segmentCount });
            snakes.push({ ...pack, cameraFollow: spec.cameraFollow });
            excludeKeys = pack.occupiedKeys;
        }
        goals = spawnSnakeGoalPool(state, config.goalCount, { excludeKeys });
    });
    return { snakes, goals };
}
