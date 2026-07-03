import { applySandboxSceneSnapshot, SANDBOX_SCENE_SCHEMA_VERSION } from "../../../Libraries/Sandbox/sandboxSceneSnapshot.js";
import { PIPE_SPAWNER_BALL_TINT } from "../../../Libraries/Color/visualOverride.js";
import { spawnPlacedSandboxProp } from "../../../Libraries/Sandbox/sandboxPlacedSpawn.js";
import { addDistanceConstraint } from "../../../Libraries/Motion/kineticConstraints.js";
import { setChainHead } from "../../../Libraries/Sandbox/chainLinks.js";
import { getSandboxEntityMeta } from "../../../GameState/sandboxEntityMeta.js";
import { SANDBOX_DEFAULT_FACTION, sandboxFactions } from "../../../Libraries/Sandbox/sandboxFaction.js";
import { collectWalkableCells } from "../../../Libraries/Procedural/Mazes/walkableCells.js";
import { withSeededRandom, shuffleInPlace } from "../../../Libraries/Random/index.js";
import { applyPlayAreaConfig, generateLabCaverns } from "./mapWorld.js";
const STRESS_CHAIN_SEGMENT_COUNT = 45;
const STRESS_CHAIN_BALL_TINT = PIPE_SPAWNER_BALL_TINT;
const STRESS_SHAPE_BATCHES = [
    { type: "hex_block", count: 100 },
    { type: "glass_pane", count: 100, randomBox: true },
    { type: "custom_box", count: 100, randomBox: true },
    { type: "crate", count: 100 },
    { type: "tri_wedge", count: 100 },
];
const STRESS_BOX_SIZE_MIN = 8;
const STRESS_BOX_SIZE_MAX = 64;
const STRESS_BOX_SIZE_STEP = 8;
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
function randomQuantizedBoxSize() {
    const steps = (STRESS_BOX_SIZE_MAX - STRESS_BOX_SIZE_MIN) / STRESS_BOX_SIZE_STEP + 1;
    return STRESS_BOX_SIZE_MIN + Math.floor(Math.random() * steps) * STRESS_BOX_SIZE_STEP;
}
function randomBoxHalfExtents() {
    const width = randomQuantizedBoxSize();
    const height = randomQuantizedBoxSize();
    return { x: width / 2, y: height / 2 };
}
function buildChainPathThroughCavern(openCells, segmentCount) {
    if (openCells.length === 0) return [];
    const path = [openCells[0]];
    const used = new Set([0]);
    while (path.length < segmentCount && path.length < openCells.length) {
        const last = path[path.length - 1];
        let bestIdx = -1;
        let bestDist = Infinity;
        for (let i = 0; i < openCells.length; i++) {
            if (used.has(i)) continue;
            const cell = openCells[i];
            const dist = (cell.col - last.col) ** 2 + (cell.row - last.row) ** 2;
            if (dist < bestDist) {
                bestDist = dist;
                bestIdx = i;
            }
        }
        if (bestIdx < 0) break;
        used.add(bestIdx);
        path.push(openCells[bestIdx]);
    }
    return path;
}
function spawnCavernStressChain(state) {
    const grid = state.obstacleGrid;
    const openCells = collectWalkableCells(state);
    if (!openCells.length) throw new Error("Cavern has no open floor cells for chain placement");
    withSeededRandom(state.mapSeed + 2, () => {
        shuffleInPlace(openCells);
        const path = buildChainPathThroughCavern(openCells, STRESS_CHAIN_SEGMENT_COUNT);
        const props = [];
        for (let i = 0; i < path.length; i++) {
            const { col, row } = path[i];
            const { x, y } = grid.gridToWorld(col, row);
            props.push(spawnPlacedSandboxProp(state, x, y, "ball", sandboxFactions.alpha, 0, undefined, { tint: STRESS_CHAIN_BALL_TINT }));
        }
        for (let i = 0; i < props.length - 1; i++) {
            const restLength = Math.hypot(props[i + 1].x - props[i].x, props[i + 1].y - props[i].y);
            addDistanceConstraint(state.kinetic, { bodyA: props[i], bodyB: props[i + 1], restLength });
        }
        if (props.length > 0) setChainHead(state, getSandboxEntityMeta(state), props[0].id);
    });
}
function spawnCavernStressProps(state) {
    const grid = state.obstacleGrid;
    const cellSize = grid.cellSize;
    const openCells = collectWalkableCells(state);
    if (!openCells.length) throw new Error("Cavern has no open floor cells for prop placement");
    spawnCavernStressChain(state);
    withSeededRandom(state.mapSeed + 3, () => {
        shuffleInPlace(openCells);
        let cellIndex = 0;
        const takeWorldPos = () => {
            if (cellIndex >= openCells.length) return null;
            const { col, row } = openCells[cellIndex++];
            const { x, y } = grid.gridToWorld(col, row);
            const jitter = cellSize * 0.35;
            return { x: x + (Math.random() - 0.5) * jitter, y: y + (Math.random() - 0.5) * jitter };
        };
        for (let b = 0; b < STRESS_SHAPE_BATCHES.length; b++) {
            const batch = STRESS_SHAPE_BATCHES[b];
            for (let i = 0; i < batch.count; i++) {
                const pos = takeWorldPos();
                if (!pos) return;
                const halfExtents = batch.randomBox ? randomBoxHalfExtents() : undefined;
                spawnPlacedSandboxProp(state, pos.x, pos.y, batch.type, SANDBOX_DEFAULT_FACTION, 0, halfExtents);
            }
        }
    });
}
/** Replace the sandbox with a procedural cavern, a long ball chain, and shape batches for stress tests. */
export async function spawnSandboxStartScene(state) {
    await applyPlayAreaConfig(state);
    await applySandboxSceneSnapshot(state, buildEmptySandboxDoc(state));
    const cavernConfig = state.editor.cavernConfig;
    const prevWallHeightLevel = cavernConfig.wallHeightLevel;
    cavernConfig.wallHeightLevel = 1;
    await generateLabCaverns(state);
    cavernConfig.wallHeightLevel = prevWallHeightLevel;
    spawnCavernStressProps(state);
}
