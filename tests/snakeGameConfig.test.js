import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { SNAKE_GAME_DEFAULTS } from "../Config/games/snake.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeEatRadius, resolveSnakeSegmentSpacing } from "../Libraries/Game/snake/snakeGameConfig.js";

loadPropAssets();

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
        assert.equal(eatRadius, 4 + 5 + SNAKE_GAME_DEFAULTS.eatMargin);
        assert.equal(resolveSnakeEatRadius(getSnakeGameConfig(), 2), 2 + 5 + SNAKE_GAME_DEFAULTS.eatMargin);
    });

    it("applySnakeGameConfig merges overrides onto defaults", () => {
        applySnakeGameConfig({ linkSlack: 1.1, eatMargin: 4 });
        assert.equal(getSnakeGameConfig().linkSlack, 1.1);
        assert.equal(getSnakeGameConfig().eatMargin, 4);
        assert.equal(resolveSnakeSegmentSpacing(), 4 * 2 * 1.1);
        assert.equal(resolveSnakeEatRadius(), 4 + 5 + 4);
        applySnakeGameConfig();
    });
});
