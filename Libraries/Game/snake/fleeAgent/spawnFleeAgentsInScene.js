import { withSeededRandom } from "../../../Random/index.js";
import { pickWalkableCell } from "../../../Procedural/Mazes/walkableCells.js";
import { colRowToIndex } from "../../../Spatial/grid/GridUtils.js";
import { linkedChainOccupiedCellIndices } from "../../../Sandbox/spawnLinkedBallChain.js";
import { getSnakeGameConfig } from "../snakeGameConfig.js";
import { pickSnakeChainSpawnCell } from "../snakeScene.js";
import { setAgentIdentity, pickRandomName } from "../../../AI/identity/agentIdentity.js";
import { FLEE_AGENT_MEMBER_COUNT, resolveFleeAgentForwardDir, spawnFleeAgent } from "./spawnFleeAgent.js";
import { createFleeAgentInstance } from "./FleeAgentInstance.js";
function isValidFleeAgentAnchorCell(navWalkable, grid, anchorCell, { excludeIndices }) {
    const { col, row } = anchorCell;
    if (!navWalkable.has(col, row)) return false;
    if (excludeIndices?.has(colRowToIndex(col, row, grid.cols))) return false;
    return true;
}
function pickFleeAgentSpawnCell(spawnPool, navWalkable, state, { excludeIndices, rng = Math.random }) {
    const grid = state.obstacleGrid;
    const valid = [];
    for (let i = 0; i < spawnPool.length; i++) {
        const cell = spawnPool[i];
        if (isValidFleeAgentAnchorCell(navWalkable, grid, cell, { excludeIndices })) valid.push(cell);
    }
    if (!valid.length) return null;
    return pickWalkableCell(valid, { cols: grid.cols, excludeIndices, rng });
}
export function spawnFleeAgentsInScene(state, navWalkable, { excludeIndices = null, rng = Math.random } = {}) {
    const config = getSnakeGameConfig();
    const count = Math.max(0, Math.round(config.boidCount));
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
        let anchorCell = pickFleeAgentSpawnCell(shuffledSpawnCells, navWalkable, state, { excludeIndices: occupied, rng });
        if (!anchorCell)
            anchorCell = pickSnakeChainSpawnCell(shuffledSpawnCells, navWalkable, state, {
                segmentCount: FLEE_AGENT_MEMBER_COUNT,
                spacing: 0,
                growDirX: forwardDir.x,
                growDirY: forwardDir.y,
                excludeIndices: occupied,
                rng,
            });
        const pack = spawnFleeAgent(state, anchorCell, { forwardDir });
        setAgentIdentity(pack.head.id, { name: pickRandomName(rng), color: "#7ad4ff" });
        const instance = createFleeAgentInstance(state, { headId: pack.head.id, spawnGroupId: pack.spawnGroupId });
        agents.push({ pack, instance });
        for (const idx of linkedChainOccupiedCellIndices(pack.members, state.obstacleGrid)) occupied.add(idx);
    }
    return agents;
}
export function spawnFleeAgentsScene(state, navWalkable, excludeIndices) {
    const config = getSnakeGameConfig();
    return withSeededRandom(state.mapSeed + (config.cavern.mapSeedOffset ?? 0) + 9173, () => spawnFleeAgentsInScene(state, navWalkable, { excludeIndices, rng: Math.random }));
}
