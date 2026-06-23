import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySnakeHeadGameplay } from "../Libraries/Game/snake/snakeGameConfig.js";
import { applySnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { spawnPlacedSandboxProp } from "../Libraries/Sandbox/sandboxPlacedSpawn.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { getKineticRollConfig } from "../Libraries/Sandbox/kineticRollActuator.js";

describe("snakeHeadGameplay", () => {
    it("applies headMaxSpeed from snake config onto the head prop strategy", () => {
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
