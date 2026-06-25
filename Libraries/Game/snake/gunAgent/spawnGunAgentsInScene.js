import { withSeededRandom } from "../../../Random/index.js";
import { pickWalkableCell } from "../../../Procedural/Mazes/walkableCells.js";
import { colRowToIndex } from "../../../Spatial/grid/GridUtils.js";
import { linkedChainOccupiedCellIndices } from "../../../Sandbox/spawnLinkedBallChain.js";
import { getSnakeGameConfig } from "../snakeGameConfig.js";
import { pickSnakeChainSpawnCell } from "../snakeScene.js";
import { setAgentIdentity, pickRandomName } from "../../../AI/identity/agentIdentity.js";
import { AGENT_PROFILE, getAgentProfile } from "../../../AI/agents/agentProfile.js";
import { FLEE_AGENT_MEMBER_COUNT, resolveFleeAgentForwardDir, spawnGunAgent } from "../spawnAgentChain.js";
function isValidGunAgentAnchorCell(navWalkable, grid, anchorCell, { excludeIndices }) {
    const { col, row } = anchorCell;
    if (!navWalkable.has(col, row)) return false;
    if (excludeIndices?.has(colRowToIndex(col, row, grid.cols))) return false;
    return true;
}
function pickGunAgentSpawnCell(spawnPool, navWalkable, state, { excludeIndices, rng = Math.random }) {
    const grid = state.obstacleGrid;
    const valid = [];
    for (let i = 0; i < spawnPool.length; i++) {
        const cell = spawnPool[i];
        if (isValidGunAgentAnchorCell(navWalkable, grid, cell, { excludeIndices })) valid.push(cell);
    }
    if (!valid.length) return null;
    return pickWalkableCell(valid, { cols: grid.cols, excludeIndices, rng });
}
export function spawnGunAgentsInScene(state, navWalkable, { excludeIndices = null, rng = Math.random } = {}) {
    const config = getSnakeGameConfig();
    const count = Math.max(0, Math.round(config.gunAgentCount ?? 0));
    if (count === 0) return [];
    const forwardDir = resolveFleeAgentForwardDir(config);
    const spawnCells = navWalkable.cells();
    const shuffledSpawnCells = spawnCells.slice();
    for (let i = shuffledSpawnCells.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = shuffledSpawnCells[i];
        shuffledSpawnCells[i] = shuffledSpawnCells[j];
        shuffledSpawnCells[j] = tmp;
    }
    let occupied = excludeIndices ? new Set(excludeIndices) : new Set();
    const agents = [];
    for (let i = 0; i < count; i++) {
        let anchorCell = pickGunAgentSpawnCell(shuffledSpawnCells, navWalkable, state, { excludeIndices: occupied, rng });
        if (!anchorCell)
            anchorCell = pickSnakeChainSpawnCell(shuffledSpawnCells, navWalkable, state, {
                segmentCount: FLEE_AGENT_MEMBER_COUNT,
                spacing: 0,
                growDirX: forwardDir.x,
                growDirY: forwardDir.y,
                excludeIndices: occupied,
                rng,
            });
        const pack = spawnGunAgent(state, anchorCell, { forwardDir });
        setAgentIdentity(pack.head.id, { name: pickRandomName(rng), color: null });
        const occupiedIndices = new Set(occupied);
        for (const idx of linkedChainOccupiedCellIndices([pack.head], state.obstacleGrid)) occupiedIndices.add(idx);
        agents.push({ pack, occupiedIndices });
        occupied = occupiedIndices;
    }
    return agents;
}
export function spawnGunAgentsScene(state, navWalkable, excludeIndices) {
    const config = getSnakeGameConfig();
    return withSeededRandom(state.mapSeed + (config.cavern.mapSeedOffset ?? 0) + 4826, () => spawnGunAgentsInScene(state, navWalkable, { excludeIndices, rng: Math.random }));
}
