import { applySandboxSceneSnapshot, SANDBOX_SCENE_SCHEMA_VERSION } from "../../Sandbox/sandboxSceneSnapshot.js";
import { collectOpenCavernCells, pickOpenCavernCell } from "../../Sandbox/cavernFloorCells.js";
import { linkedChainOccupiedCellKeys, spawnLinkedBallChain } from "../../Sandbox/spawnLinkedBallChain.js";
import { spawnPlacedSandboxProp } from "../../Sandbox/sandboxPlacedSpawn.js";
import { SANDBOX_DEFAULT_FACTION } from "../../Sandbox/sandboxFaction.js";
import { withSeededRandom } from "../../Random/index.js";
import { applyPlayAreaConfig, generateLabCaverns } from "../../../Apps/Editor/world/mapWorld.js";
import { getSnakeGameConfig, resolveSnakeSegmentSpacing } from "./snakeGameConfig.js";
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
export async function spawnSnakeCavernScene(state) {
    const config = getSnakeGameConfig();
    await spawnSnakeCavernMap(state);
    const openCells = collectOpenCavernCells(state);
    if (!openCells.length) throw new Error("Cavern has no open floor cells for snake placement");
    let chain = null;
    let goal = null;
    withSeededRandom(state.mapSeed + config.cavern.mapSeedOffset, () => {
        shuffleInPlace(openCells);
        const anchorCell = pickOpenCavernCell(openCells);
        chain = spawnLinkedBallChain(state, anchorCell, {
            segmentCount: config.segmentCount,
            spacing: resolveSnakeSegmentSpacing(config),
            ballType: config.segmentPropId,
            headBallType: config.headPropId,
            growDirX: config.growDirX,
            growDirY: config.growDirY,
            exportType: SNAKE_CHAIN_EXPORT_TYPE,
        });
        const occupied = linkedChainOccupiedCellKeys(chain.members, state.obstacleGrid);
        goal = spawnGoalOrbOnOpenCell(state, { excludeKeys: occupied });
    });
    return { chain, goal };
}
