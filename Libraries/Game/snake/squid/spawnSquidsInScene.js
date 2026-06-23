import { withSeededRandom } from "../../../Random/index.js";
import { linkedChainOccupiedCellIndices } from "../../../Sandbox/spawnLinkedBallChain.js";
import { getSnakeGameConfig, resolveSnakeSegmentSpacing, resolveSnakeStartRadius } from "../snakeGameConfig.js";
import { pickSnakeChainSpawnCell } from "../snakeScene.js";
import { setAgentIdentity, pickRandomName } from "../../../AI/identity/agentIdentity.js";
import { AGENT_PROFILE, getAgentProfile } from "../../../AI/agents/agentProfile.js";
import { spawnSquidChain } from "./spawnSquidChain.js";

function pickSquidSpawnCell(spawnPool, navWalkable, state, { excludeIndices, rng = Math.random }) {
    const config = getSnakeGameConfig();
    const profile = getAgentProfile(AGENT_PROFILE.squid, config);
    const segmentCount = profile.segmentCount ?? 3;
    const spacing = resolveSnakeSegmentSpacing(config, resolveSnakeStartRadius(config));
    const growDirX = profile.growDirX ?? -1;
    const growDirY = profile.growDirY ?? 0;
    return pickSnakeChainSpawnCell(spawnPool, navWalkable, state, {
        segmentCount,
        spacing,
        growDirX,
        growDirY,
        excludeIndices,
        rng,
    });
}

export function spawnSquidsInScene(state, navWalkable, { excludeIndices = null, rng = Math.random } = {}) {
    const config = getSnakeGameConfig();
    const count = config.squidCount ?? 0;
    if (count <= 0) return [];
    const spawnPool = navWalkable.cells();
    const squids = [];
    let occupied = excludeIndices ? new Set(excludeIndices) : new Set();
    withSeededRandom(state.mapSeed + 37, () => {
        for (let i = 0; i < count; i++) {
            const anchorCell = pickSquidSpawnCell(spawnPool, navWalkable, state, { excludeIndices: occupied, rng });
            if (!anchorCell) break;
            const faction = i % 2 === 0 ? "charlie" : "delta";
            const tintHex = i % 2 === 0 ? "#9b59b6" : "#1abc9c";
            const pack = spawnSquidChain(state, anchorCell, { faction });
            setAgentIdentity(pack.brain.id, { name: pickRandomName(rng), color: tintHex });
            for (let m = 0; m < pack.members.length; m++) pack.members[m].tint = tintHex;
            const occupiedIndices = new Set(occupied);
            const cells = linkedChainOccupiedCellIndices(pack.members, state.obstacleGrid);
            for (const idx of cells) occupiedIndices.add(idx);
            squids.push({ pack, tintHex, occupiedIndices });
            occupied = occupiedIndices;
        }
    });
    return squids;
}
