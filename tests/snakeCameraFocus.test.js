import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { applySnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { spawnSnakeChain } from "../Libraries/Game/snake/snakeScene.js";
import { spawnSnakeStriker } from "../Libraries/Game/snake/snakeStriker.js";
import { createSnakeLifecycleRegistry, registerAliveSnake, wireSnakeGameRegistry } from "../Libraries/Game/snake/snakeLifecycle.js";
import { killSnake } from "../Libraries/Game/snake/snakeCombat.js";
import { setSandboxCameraTarget, findSandboxCameraTargetWorldProp } from "../Libraries/Sandbox/sandboxCameraTarget.js";
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
        navigation: { settings: {}, onObstaclesChanged: async () => {} },
    };
}

function wireCameraFocusOnHeadDied(state, registry, strikerBall) {
    let focusedHeadId = null;
    let cameraFocus = "snake";
    function pickNextFocusedHeadId(skipHeadId = null) {
        for (const headId of registry.aliveByHeadId.keys()) {
            if (headId !== skipHeadId) return headId;
        }
        return null;
    }
    function retargetFocusedSnake(skipHeadId = null) {
        const nextHeadId = pickNextFocusedHeadId(skipHeadId);
        focusedHeadId = nextHeadId;
        if (nextHeadId == null) return null;
        const head = state.entityRegistry.getLive(nextHeadId);
        if (cameraFocus === "snake") {
            setSandboxCameraTarget(state, strikerBall, false);
            setSandboxCameraTarget(state, head, true);
        }
        return head;
    }
    state.sandbox.snakeGame.onHeadDied = (headId) => {
        if (focusedHeadId !== headId) return;
        if (retargetFocusedSnake(headId)) return;
        if (cameraFocus === "snake") {
            setSandboxCameraTarget(state, state.entityRegistry.getLive(headId), false);
            setSandboxCameraTarget(state, strikerBall, true);
            cameraFocus = "ball";
        }
    };
    return {
        focusHead(headId) {
            focusedHeadId = headId;
            setSandboxCameraTarget(state, strikerBall, false);
            setSandboxCameraTarget(state, state.entityRegistry.getLive(headId), true);
        },
        getFocusedHeadId: () => focusedHeadId,
    };
}

describe("snake camera focus", () => {
    it("retargets to another alive snake when the focused head dies", () => {
        applySnakeGameConfig({ segmentCount: 3, strikerPropId: "snake_striker" });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const registry = createSnakeLifecycleRegistry();
        wireSnakeGameRegistry(state, registry, new Map(), createSnakeNavWalkable(state));
        const first = spawnSnakeChain(state, { col: 8, row: 8 }, { segmentCount: 3 });
        const second = spawnSnakeChain(state, { col: 14, row: 8 }, { segmentCount: 3 });
        registerAliveSnake(registry, first.chain.head.id);
        registerAliveSnake(registry, second.chain.head.id);
        const strikerBall = spawnSnakeStriker(state, first.chain.head);
        state.sandbox.snakeGame.strikerBall = strikerBall;
        const focus = wireCameraFocusOnHeadDied(state, registry, strikerBall);
        focus.focusHead(first.chain.head.id);
        killSnake(state, state.sandbox.snakeGame, first.chain.head.id);
        assert.equal(focus.getFocusedHeadId(), second.chain.head.id);
        const target = findSandboxCameraTargetWorldProp(state, state.entityRegistry);
        assert.equal(target.id, second.chain.head.id);
    });
});
