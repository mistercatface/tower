import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSnakeGameSession } from "../Libraries/Game/snakeGameSession.js";
import { createNavRuntime } from "./WorkerNavigationFactory.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/spatial.js";
import { mockBall, mockRollingProp } from "./harness/kineticTickHarness.js";

function createCorridorFleeTestState() {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 128, 128);
    for (let col = 0; col < grid.cols; col++) {
        grid.grid[col] = 1;
        grid.grid[(grid.rows - 1) * grid.cols + col] = 1;
    }
    for (let row = 1; row < grid.rows - 1; row++) {
        for (let col = 1; col < grid.cols - 1; col++) grid.grid[row * grid.cols + col] = 0;
    }
    const nav = createNavRuntime(grid);
    return {
        obstacleGrid: grid,
        nav,
        editor: { cavernConfig: { boundsIdx: -1 } },
        viewport: { circleInBounds: () => true },
    };
}

describe("snakeGameSession", () => {
    it("binds player and enemy head for flee ticks", () => {
        const state = createCorridorFleeTestState();
        const session = createSnakeGameSession(state);
        const player = mockBall(32, 32);
        const enemyHead = mockRollingProp({ x: 96, y: 32, type: "snake" });
        session.bind({ boid: player, enemyChain: { head: enemyHead } });
        assert.doesNotThrow(() => session.tick(16));
    });
});
