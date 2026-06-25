import { withSeededRandom, shuffleInPlace } from "../../Random/index.js";
import { pickWalkableCell } from "../../Procedural/Mazes/walkableCells.js";
import { colRowToIndex } from "../../Spatial/grid/GridUtils.js";
import { linkedChainOccupiedCellIndices } from "../../Sandbox/spawnLinkedBallChain.js";
import { getSnakeGameConfig, resolveSnakeSegmentSpacing, resolveSnakeStartRadius } from "./snakeGameConfig.js";
import { pickSnakeChainSpawnCell } from "./snakeScene.js";
import { setAgentIdentity, pickRandomName } from "../../AI/identity/agentIdentity.js";
import { getAgentProfile } from "../../AI/agents/agentProfile.js";
import { spawnGameAgentChain } from "./spawnAgentChain.js";
import { hashString } from "../../Math/hash.js";
function resolveAgentTeamForIndex(profile, index) {
    const teams = profile.teams;
    if (!Array.isArray(teams) || teams.length === 0) return { faction: profile.faction ?? "neutral", color: null };
    return teams[index % teams.length] ?? teams[0];
}
function isValidAgentAnchorCell(navWalkable, grid, anchorCell, { excludeIndices }) {
    const { col, row } = anchorCell;
    if (!navWalkable.has(col, row)) return false;
    if (excludeIndices?.has(colRowToIndex(col, row, grid.cols))) return false;
    return true;
}
function pickAgentSpawnCell(spawnPool, navWalkable, state, profile, { excludeIndices, rng = Math.random }) {
    const grid = state.obstacleGrid;
    const segmentCount = profile.segmentCount ?? 1;
    if (segmentCount > 1) {
        const config = getSnakeGameConfig();
        const spacing = resolveSnakeSegmentSpacing(config, resolveSnakeStartRadius(config));
        const growDirX = profile.growDirX ?? -1;
        const growDirY = profile.growDirY ?? 0;
        return pickSnakeChainSpawnCell(spawnPool, navWalkable, state, { segmentCount, spacing, growDirX, growDirY, excludeIndices, rng });
    }
    const valid = [];
    for (let i = 0; i < spawnPool.length; i++) {
        const cell = spawnPool[i];
        if (isValidAgentAnchorCell(navWalkable, grid, cell, { excludeIndices })) valid.push(cell);
    }
    if (!valid.length) return null;
    return pickWalkableCell(valid, { cols: grid.cols, excludeIndices, rng });
}
function resolvePopulationCount(profileId, config) {
    const profile = config.agentProfiles[profileId];
    return profile?.populationCount ?? 0;
}
export function spawnPopulationInScene(state, navWalkable, profileId, { excludeIndices = null, rng = Math.random } = {}) {
    const config = getSnakeGameConfig();
    const count = resolvePopulationCount(profileId, config);
    if (count <= 0) return [];
    const profile = getAgentProfile(profileId, config);
    const spawnPool = navWalkable.cells();
    const shuffledSpawnCells = shuffleInPlace(spawnPool.slice(), rng);
    let occupied = excludeIndices ? new Set(excludeIndices) : new Set();
    const agents = [];
    for (let i = 0; i < count; i++) {
        const anchorCell = pickAgentSpawnCell(shuffledSpawnCells, navWalkable, state, profile, { excludeIndices: occupied, rng });
        if (!anchorCell) break;
        const team = resolveAgentTeamForIndex(profile, i);
        const pack = spawnGameAgentChain(state, anchorCell, profileId, { faction: team.faction });
        const identityName = pickRandomName(rng);
        const leader = pack.brain ?? pack.head;
        setAgentIdentity(leader.id, { name: identityName, color: team.color });
        const members = pack.members ?? [pack.head];
        if (team.color) for (let m = 0; m < members.length; m++) members[m].tint = team.color;
        const occupiedIndices = new Set(occupied);
        for (const idx of linkedChainOccupiedCellIndices(members, state.obstacleGrid)) occupiedIndices.add(idx);
        agents.push({ pack, tintHex: team.color, occupiedIndices });
        occupied = occupiedIndices;
    }
    return agents;
}
export function spawnPopulationScene(state, navWalkable, profileId, excludeIndices) {
    const config = getSnakeGameConfig();
    const profile = getAgentProfile(profileId, config);
    const seedOffset = profile.spawnSeedOffset ?? hashString(profileId) % 10000;
    const baseSeed = state.mapSeed + seedOffset;
    const seed = profile.spawnSeedIgnoreMapSeedOffset ? baseSeed : baseSeed + (config.cavern.mapSeedOffset ?? 0);
    return withSeededRandom(seed, () => spawnPopulationInScene(state, navWalkable, profileId, { excludeIndices, rng: Math.random }));
}
