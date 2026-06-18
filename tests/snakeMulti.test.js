import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { getChainMemberIds } from "../Libraries/Sandbox/chainLinks.js";
import { createHpaGroundNavBehavior } from "../Libraries/Sandbox/groundNav/hpaGroundNavBehavior.js";
import { HPA_GROUND_NAV_BEHAVIOR_ID } from "../Libraries/Sandbox/groundNav/groundNavIds.js";
import { buildSpherePanelsFromHue, setPropSpherePanels, spherePanelsCacheKey } from "../Libraries/Props/propSpherePanels.js";
import { pickSnakeChainPanels } from "../Libraries/Game/snake/snakeChainColor.js";
import { createSnakeAutosim, countLiveSnakeGoals } from "../Libraries/Game/snake/snakeAutosim.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSpawnSpecs } from "../Libraries/Game/snake/snakeGameConfig.js";
import { spawnGoalOrbAtCell, spawnSnakeChain, spawnSnakeGoalPool } from "../Libraries/Game/snake/snakeScene.js";
import { SNAKE_GAME_DEFAULTS } from "../Config/games/snake.js";

loadPropAssets();

function createSnakeSceneTestState(cols = 32, rows = 32) {
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
        sandbox: new SandboxWorldState(),
        editor: { cavernConfig },
        navigation: { settings: {}, onObstaclesChanged: async () => {} },
        hpaPathWorker: { getPathSlot: () => null },
    };
}

describe("propSpherePanels", () => {
    it("builds six hex panel colors from a hue", () => {
        const panels = buildSpherePanelsFromHue(120);
        assert.equal(panels.length, 6);
        for (let i = 0; i < panels.length; i++) assert.match(panels[i], /^#[0-9a-f]{6}$/i);
    });

    it("spherePanelsCacheKey is empty without override and stable with panels", () => {
        const prop = {};
        assert.equal(spherePanelsCacheKey(prop), "");
        setPropSpherePanels(prop, buildSpherePanelsFromHue(30));
        assert.ok(spherePanelsCacheKey(prop).startsWith("sp"));
    });
});

describe("snake multi-spawn", () => {
    it("derives spawn specs from snakeCount and playerSnakeIndex", () => {
        applySnakeGameConfig();
        const specs = resolveSnakeSpawnSpecs();
        assert.equal(specs.length, SNAKE_GAME_DEFAULTS.snakeCount);
        assert.equal(specs[0].cameraFollow, true);
        assert.equal(specs[1].cameraFollow, false);
        assert.equal(specs[1].segmentCount, SNAKE_GAME_DEFAULTS.segmentCount);
    });

    it("spawnSnakeChain tints every segment the same color", () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(1);
        const state = createSnakeSceneTestState();
        const panels = pickSnakeChainPanels(() => 0.25);
        const pack = spawnSnakeChain(state, { col: 10, row: 10 }, { segmentCount: 3, rng: () => 0.25 });
        assert.deepEqual(pack.panels, panels);
        const memberIds = getChainMemberIds(state, pack.chain.head.id);
        assert.equal(memberIds.length, 3);
        for (let i = 0; i < memberIds.length; i++) {
            const prop = state.entityRegistry.getLive(memberIds[i]);
            assert.deepEqual(prop.spherePanels, panels);
        }
    });

    it("two chains get different random colors and goal pool respects goalCount", () => {
        applySnakeGameConfig({ goalCount: 3 });
        resetKineticConstraintIds(1);
        const state = createSnakeSceneTestState();
        const first = spawnSnakeChain(state, { col: 8, row: 8 }, { segmentCount: 3, rng: () => 0.1 });
        const second = spawnSnakeChain(state, { col: 20, row: 20 }, { segmentCount: 3, excludeKeys: first.occupiedKeys, rng: () => 0.9 });
        assert.notDeepEqual(first.panels, second.panels);
        const goals = spawnSnakeGoalPool(state, 3, { excludeKeys: first.occupiedKeys, rng: () => 0.5 });
        assert.equal(goals.length, 3);
        assert.equal(countLiveSnakeGoals(state), 3);
    });

    it("new segment inherits head panel color after eating", () => {
        applySnakeGameConfig({ goalCount: 1 });
        resetKineticConstraintIds(1);
        const state = createSnakeSceneTestState();
        const pack = spawnSnakeChain(state, { col: 10, row: 10 }, { segmentCount: 3, rng: () => 0.5 });
        const goal = spawnGoalOrbAtCell(state, { col: 14, row: 10 });
        const behaviorById = new Map([[HPA_GROUND_NAV_BEHAVIOR_ID, createHpaGroundNavBehavior(state)]]);
        const autosim = createSnakeAutosim(state, {
            headId: pack.chain.head.id,
            goalPropId: goal.id,
            behaviorById,
            eatRadius: 20,
            rng: () => 0,
        });
        autosim.start();
        pack.chain.head.x = goal.x;
        pack.chain.head.y = goal.y;
        autosim.tick(1 / 60);
        const memberIds = getChainMemberIds(state, pack.chain.head.id);
        const tail = state.entityRegistry.getLive(memberIds[memberIds.length - 1]);
        assert.deepEqual(tail.spherePanels, pack.panels);
        assert.equal(countLiveSnakeGoals(state), 1);
    });
});

describe("snake config counts", () => {
    it("applySnakeGameConfig overrides snakeCount and goalCount", () => {
        applySnakeGameConfig({ snakeCount: 30, goalCount: 15, segmentCount: 3 });
        assert.equal(getSnakeGameConfig().snakeCount, 30);
        assert.equal(getSnakeGameConfig().goalCount, 15);
        assert.equal(resolveSnakeSpawnSpecs().length, 30);
        applySnakeGameConfig();
    });
});
