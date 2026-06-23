import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SNAKE_GAME_DEFAULTS, SNAKE_KINETIC_MIN_STRIKE_SPEED } from "../Config/games/snake.js";
import { applySnakeGameConfig, applySnakeHeadGameplay, getSnakeGameConfig, resolveSnakeEatRadius, resolveSnakeSegmentSpacing, resolveSnakeWallDamageConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { spawnPlacedSandboxProp } from "../Libraries/Sandbox/sandboxPlacedSpawn.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { getKineticRollConfig } from "../Libraries/Sandbox/kineticRollActuator.js";

describe("snakeGameConfig", () => {
    it("derives segment spacing from segment prop diameter and linkSlack", () => {
        applySnakeGameConfig();
        const spacing = resolveSnakeSegmentSpacing();
        assert.equal(spacing, 4 * 2 * SNAKE_GAME_DEFAULTS.linkSlack);
        assert.equal(resolveSnakeSegmentSpacing(getSnakeGameConfig(), 2), 2 * 2 * SNAKE_GAME_DEFAULTS.linkSlack);
    });

    it("derives eat radius from segment, goal prop radii, and eat margin", () => {
        applySnakeGameConfig();
        const eatRadius = resolveSnakeEatRadius();
        assert.equal(eatRadius, 4 + 2 + SNAKE_GAME_DEFAULTS.eatMargin);
        assert.equal(resolveSnakeEatRadius(getSnakeGameConfig(), 2), 2 + 2 + SNAKE_GAME_DEFAULTS.eatMargin);
    });

    it("resolveSnakeWallDamageConfig links kinetic floor to reference speed ceiling", () => {
        applySnakeGameConfig();
        const wallDamage = resolveSnakeWallDamageConfig();
        assert.equal(wallDamage.minStrikeSpeed, SNAKE_KINETIC_MIN_STRIKE_SPEED);
        assert.equal(wallDamage.minStrikeSpeed, getSnakeGameConfig().kineticMinStrikeSpeed);
        assert.equal(wallDamage.referenceMaxSpeed, 560);
        assert.equal(wallDamage.maxHp, SNAKE_GAME_DEFAULTS.wallDamage.maxHp);
    });

    it("applySnakeGameConfig merges overrides onto defaults", () => {
        applySnakeGameConfig({ linkSlack: 1.1, eatMargin: 4 });
        assert.equal(getSnakeGameConfig().linkSlack, 1.1);
        assert.equal(getSnakeGameConfig().eatMargin, 4);
        assert.equal(resolveSnakeSegmentSpacing(), 4 * 2 * 1.1);
        assert.equal(resolveSnakeEatRadius(), 4 + 2 + 4);
        applySnakeGameConfig();
    });

    it("applySnakeHeadGameplay copies headMaxSpeed onto the head prop strategy", () => {
        applySnakeGameConfig({ headMaxSpeed: 95 });
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 256, 256);
        const state = { obstacleGrid: grid, entityRegistry: new EntityRegistry(), worldProps: [], kinetic: new KineticSession(), sandbox: new SandboxWorldState() };
        const head = spawnPlacedSandboxProp(state, 80, 80, "snake_head");
        applySnakeHeadGameplay(head);
        assert.equal(getKineticRollConfig(head).maxSpeed, 95);
        applySnakeGameConfig();
    });
});
