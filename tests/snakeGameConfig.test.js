import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SNAKE_GAME_DEFAULTS, SNAKE_KINETIC_MIN_STRIKE_SPEED } from "../Config/games/snake.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeEatRadius, resolveSnakeSegmentSpacing, resolveSnakeWallDamageConfig } from "../Libraries/Game/snake/snakeGameConfig.js";

describe("snakeGameConfig", () => {
    it("derives segment spacing from segment prop diameter and linkSlack", () => {
        applySnakeGameConfig();
        const spacing = resolveSnakeSegmentSpacing();
        assert.equal(spacing, 4 * 2 * SNAKE_GAME_DEFAULTS.agentProfiles.snake.linkSlack);
        assert.equal(resolveSnakeSegmentSpacing(getSnakeGameConfig(), 2), 2 * 2 * SNAKE_GAME_DEFAULTS.agentProfiles.snake.linkSlack);
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
        assert.equal(wallDamage.minBreakStrength, SNAKE_GAME_DEFAULTS.wallDamage.minBreakStrength);
    });

    it("applySnakeGameConfig merges overrides onto defaults", () => {
        applySnakeGameConfig({ agentProfiles: { snake: { linkSlack: 1.1 } }, eatMargin: 4 });
        assert.equal(getSnakeGameConfig().agentProfiles.snake.linkSlack, 1.1);
        assert.equal(getSnakeGameConfig().eatMargin, 4);
        assert.equal(resolveSnakeSegmentSpacing(), 4 * 2 * 1.1);
        assert.equal(resolveSnakeEatRadius(), 4 + 2 + 4);
        applySnakeGameConfig();
    });

    it("pure helper calls return correct calculations without config objects", () => {
        assert.equal(resolveSnakeSegmentSpacing(1.5, 4), 4 * 2 * 1.5);
        assert.equal(resolveSnakeEatRadius(3, 5, 2), 2 + 3 + 5);
        const wallDamage = resolveSnakeWallDamageConfig({ minBreakStrength: 0.8, referenceMaxSpeed: 500 });
        assert.equal(wallDamage.minStrikeSpeed, SNAKE_KINETIC_MIN_STRIKE_SPEED);
        assert.equal(wallDamage.referenceMaxSpeed, 500);
        assert.equal(wallDamage.minBreakStrength, 0.8);
    });
});
