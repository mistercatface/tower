import { applySandboxSceneSnapshot, SANDBOX_SCENE_SCHEMA_VERSION } from "../../Sandbox/sandboxSceneSnapshot.js";
import { cavernCellKey, collectOpenCavernCells, pickOpenCavernCell } from "../../Sandbox/cavernFloorCells.js";
import { linkedChainOccupiedCellKeys, spawnLinkedBallChain } from "../../Sandbox/spawnLinkedBallChain.js";
import { spawnPlacedSandboxProp } from "../../Sandbox/sandboxPlacedSpawn.js";
import { SANDBOX_DEFAULT_FACTION } from "../../Sandbox/sandboxFaction.js";
import { withSeededRandom } from "../../Random/index.js";
import { applyPlayAreaConfig, generateLabCaverns } from "../../../Apps/Editor/world/mapWorld.js";
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
async function spawnSnakeCavernMap(state) {
    const cavern = getSnakeGameConfig().cavern;
    await applyPlayAreaConfig(state);
    await applySandboxSceneSnapshot(state, buildEmptySandboxDoc(state));
    const cavernConfig = state.editor.cavernConfig;
    const prevWallHeightLevel = cavernConfig.wallHeightLevel;
    cavernConfig.wallHeightLevel = cavern.wallHeightLevel;
    await generateLabCaverns(state);
    cavernConfig.wallHeightLevel = prevWallHeightLevel;
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
    const openCells = collectOpenCavernCells(state);
    if (!openCells.length) throw new Error("Cavern has no open floor cells for snake placement");
    const snakes = [];
    let goals = [];
    withSeededRandom(state.mapSeed + config.cavern.mapSeedOffset, () => {
        shuffleInPlace(openCells);
        let excludeKeys = null;
        const specs = resolveSnakeSpawnSpecs(config);
        for (let i = 0; i < specs.length; i++) {
            const spec = specs[i];
            const anchorCell = pickOpenCavernCell(openCells, { excludeKeys });
            if (!anchorCell) throw new Error(`Cavern has no open floor cell for snake ${i + 1}`);
            const pack = spawnSnakeChain(state, anchorCell, { excludeKeys, segmentCount: spec.segmentCount });
            snakes.push({ ...pack, cameraFollow: spec.cameraFollow });
            excludeKeys = pack.occupiedKeys;
        }
        goals = spawnSnakeGoalPool(state, config.goalCount, { excludeKeys });
    });
    return { snakes, goals };
}
