import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { spawnSnakeChain, SNAKE_CHAIN_EXPORT_TYPE } from "../Libraries/Game/snake/snakeScene.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSegmentSpacing } from "../Libraries/Game/snake/snakeGameConfig.js";
import { createSnakeLifecycleRegistry, registerAliveSnake, wireSnakeGameRegistry, isValidAliveSnakeHead } from "../Libraries/Game/snake/snakeLifecycle.js";
import { killSnake, splitSnakeAtStruckSegment, syncSnakeGameLifecycle } from "../Libraries/Game/snake/snakeCombat.js";
import { getOrderedChainMemberIds } from "../Libraries/Sandbox/chainLinks.js";
import { removeChainLinkBetween } from "../Libraries/Sandbox/chainLinks.js";
import { probeSnakeLoneHeadMovement } from "../Libraries/Game/snake/snakeLoneHeadDebug.js";
import { createSnakeNavWalkable } from "./harness/snakeGameHarness.js";

loadPropAssets();

function createTestState(cols = 32, rows = 32) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, cols * 16, rows * 16);
    const cavernConfig = createDefaultMapGenBoundsConfig();
    cavernConfig.boundsCol = 0;
    cavernConfig.boundsRow = 0;
    cavernConfig.boundsCols = cols;
    cavernConfig.boundsRows = rows;
    return {
        obstacleGrid: grid,
        entityRegistry: new EntityRegistry(),
        worldProps: [],
        kinetic: new KineticSession(),
        sandbox: new SandboxWorldState(),
        editor: { cavernConfig },
        nav: { settings: {}, commitEdit: async () => {}, topologyKey: () => "", syncedTopologyKey: () => "", graphSyncGeneration: 0, worker: { getPathSlot: () => null, releaseOwnedPathSlot: () => {} }, session: { isReplanInFlight: () => false }, topology: null },
    };
}

describe("snakeLoneHeadDebug", () => {
    it("warns when a lone dead head is still coasting", () => {
        applySnakeGameConfig({ logLoneHeadMovement: true, minAliveSegmentCount: 3 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const config = getSnakeGameConfig();
        const pack = spawnSnakeChain(state, { col: 8, row: 8 }, {
            segmentCount: 3,
            spacing: resolveSnakeSegmentSpacing(config, config.startRadius),
            segmentRadius: config.startRadius,
            linkSlack: config.linkSlack,
            ballType: config.segmentPropId,
            headBallType: config.headPropId,
            growDirX: config.growDirX,
            growDirY: config.growDirY,
            exportType: SNAKE_CHAIN_EXPORT_TYPE,
        });
        const headId = pack.chain.head.id;
        const registry = createSnakeLifecycleRegistry();
        registerAliveSnake(registry, headId);
        const autosimsByHeadId = new Map();
        wireSnakeGameRegistry(state, registry, autosimsByHeadId, createSnakeNavWalkable(state));
        const snakeGame = state.sandbox.snakeGame;
        killSnake(state, snakeGame, headId);
        pack.chain.head.vx = 12;
        pack.chain.head.vy = 4;
        const warnings = [];
        const original = console.warn;
        console.warn = (...args) => warnings.push(args.join(" "));
        try {
            probeSnakeLoneHeadMovement(state, snakeGame);
        } finally {
            console.warn = original;
        }
        assert.ok(warnings.some((line) => line.includes("[snake-lone-head") && line.includes(`id=${headId}`)));
    });

    it("warns for a split-off inert tail with no head prop", () => {
        applySnakeGameConfig({ logLoneHeadMovement: true, minAliveSegmentCount: 3 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const config = getSnakeGameConfig();
        const pack = spawnSnakeChain(state, { col: 8, row: 8 }, {
            segmentCount: 5,
            spacing: resolveSnakeSegmentSpacing(config, config.startRadius),
            segmentRadius: config.startRadius,
            linkSlack: config.linkSlack,
            ballType: config.segmentPropId,
            headBallType: config.headPropId,
            growDirX: config.growDirX,
            growDirY: config.growDirY,
            exportType: SNAKE_CHAIN_EXPORT_TYPE,
        });
        const headId = pack.chain.head.id;
        const registry = createSnakeLifecycleRegistry();
        registerAliveSnake(registry, headId);
        wireSnakeGameRegistry(state, registry, new Map(), createSnakeNavWalkable(state));
        const snakeGame = state.sandbox.snakeGame;
        const members = getOrderedChainMemberIds(state, headId);
        splitSnakeAtStruckSegment(state, snakeGame, headId, members[2]);
        const tailLead = state.entityRegistry.getLive(members[3]);
        tailLead.vx = 8;
        tailLead.vy = 3;
        const warnings = [];
        const original = console.warn;
        console.warn = (...args) => warnings.push(args.join(" "));
        try {
            probeSnakeLoneHeadMovement(state, snakeGame);
        } finally {
            console.warn = original;
        }
        assert.ok(warnings.some((line) => line.includes("[snake-headless") && line.includes(`lead=${members[3]}`)));
    });

    it("warns when a live registry head is far from its body segments", () => {
        applySnakeGameConfig({ logLoneHeadMovement: true, minAliveSegmentCount: 3, headSeparationLogDistance: 32 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const config = getSnakeGameConfig();
        const pack = spawnSnakeChain(state, { col: 8, row: 8 }, {
            segmentCount: 3,
            spacing: resolveSnakeSegmentSpacing(config, config.startRadius),
            segmentRadius: config.startRadius,
            linkSlack: config.linkSlack,
            ballType: config.segmentPropId,
            headBallType: config.headPropId,
            growDirX: config.growDirX,
            growDirY: config.growDirY,
            exportType: SNAKE_CHAIN_EXPORT_TYPE,
        });
        const headId = pack.chain.head.id;
        const registry = createSnakeLifecycleRegistry();
        registerAliveSnake(registry, headId);
        wireSnakeGameRegistry(state, registry, new Map(), createSnakeNavWalkable(state));
        const members = getOrderedChainMemberIds(state, headId);
        removeChainLinkBetween(state, members[0], members[1]);
        pack.chain.head.x += 120;
        const warnings = [];
        const original = console.warn;
        console.warn = (...args) => warnings.push(args.join(" "));
        try {
            probeSnakeLoneHeadMovement(state, state.sandbox.snakeGame);
        } finally {
            console.warn = original;
        }
        assert.ok(warnings.some((line) => line.includes("[snake-head-separated") && line.includes(`headId=${headId}`)));
    });

    it("syncSnakeGameLifecycle kills a stretched head still registered alive with autosim", () => {
        applySnakeGameConfig({ logLoneHeadMovement: true, minAliveSegmentCount: 3, headSeparationLogDistance: 32 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const config = getSnakeGameConfig();
        const pack = spawnSnakeChain(state, { col: 8, row: 8 }, {
            segmentCount: 3,
            spacing: resolveSnakeSegmentSpacing(config, config.startRadius),
            segmentRadius: config.startRadius,
            linkSlack: config.linkSlack,
            ballType: config.segmentPropId,
            headBallType: config.headPropId,
            growDirX: config.growDirX,
            growDirY: config.growDirY,
            exportType: SNAKE_CHAIN_EXPORT_TYPE,
        });
        const headId = pack.chain.head.id;
        const registry = createSnakeLifecycleRegistry();
        registerAliveSnake(registry, headId);
        const autosimsByHeadId = new Map();
        let autosimStopped = false;
        autosimsByHeadId.set(headId, { stop() { autosimStopped = true; }, isActive() { return !autosimStopped; } });
        wireSnakeGameRegistry(state, registry, autosimsByHeadId, createSnakeNavWalkable(state));
        assert.equal(isValidAliveSnakeHead(state, registry, headId), true);
        pack.chain.head.x += 120;
        assert.equal(isValidAliveSnakeHead(state, registry, headId), false);
        syncSnakeGameLifecycle(state, state.sandbox.snakeGame);
        assert.equal(registry.aliveByHeadId.has(headId), false);
        assert.equal(autosimStopped, true);
    });
});
