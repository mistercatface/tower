import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { applySnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { spawnSnakeChain } from "../Libraries/Game/snake/snakeScene.js";

import { AGENT_PROFILE } from "../Libraries/AI/agents/AgentProfiles.js";
import { registerAgentInstance } from "../Libraries/Game/snake/snakeAgentSession.js";
import { wireSnakeTestGame, registerSnakeTestInstance, createWiredSnakeAutosim, createSnakeGameHarnessState } from "./harness/snakeGameHarness.js";
import {
    appendFocusedAgentPathPreviewCommands,
    appendFocusedAgentTargetOverlayCommands,
    resolveCommittedTargetWorld,
    appendFocusedAgentVisibleEntityOverlayCommands
} from "../Libraries/Game/snake/setupSnakeGame.js";

describe("focused agent debug overlays", () => {
    it("appendFocusedAgentPathPreviewCommands draws at most three scaled purple nodes", () => {
        const out = [];
        appendFocusedAgentPathPreviewCommands(
            out,
            {
                pathNodes: [
                    { x: 0, y: 0 },
                    { x: 16, y: 0 },
                    { x: 32, y: 0 },
                    { x: 48, y: 0 },
                    { x: 64, y: 0 },
                ],
            },
            4,
        );
        assert.equal(out.filter((cmd) => cmd.kind === "circleFillStroke").length, 3);
        assert.equal(out.filter((cmd) => cmd.kind === "polyline").length, 1);
        assert.match(out[0].stroke, /156,\s*39,\s*176/);
        assert.ok(out.every((cmd) => cmd.kind !== "arrowHead"));
    });

    it("appendFocusedAgentTargetOverlayCommands marks committed entity target in red", async () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(4);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        const snakeGame = state.sandbox.snakeGame;
        const snake = spawnSnakeChain(state, { col: 10, row: 10 }, { segmentCount: 4, faction: "red", exportType: "snake" });
        const snakeInstance = registerSnakeTestInstance(state, snakeGame, { headId: snake.chain.head.id, spawnGroupId: snake.chain.spawnGroupId });
        const autosim = createWiredSnakeAutosim(state, { headId: snake.chain.head.id });
        autosim.start();
        const prey = spawnSnakeChain(state, { col: 14, row: 10 }, { segmentCount: 3, faction: "blue", exportType: "snake" });
        registerSnakeTestInstance(state, snakeGame, { headId: prey.chain.head.id, spawnGroupId: prey.chain.spawnGroupId });
        state.followCamera.focus(snakeInstance.head);
        const target = resolveCommittedTargetWorld(state, {
            mode: "seek_prey",
            targetId: prey.chain.head.id,
            destination: autosim.getDestination(),
        });
        assert.equal(target?.kind, "entity");
        snakeInstance.intent = {
            getMode: () => "seek_prey",
            getTargetId: () => prey.chain.head.id,
            getDestination: () => null,
        };
        const out = [];
        appendFocusedAgentTargetOverlayCommands(out, state, snakeGame);
        assert.equal(out.length, 1);
        assert.match(out[0].stroke, /255,\s*80,\s*80/);
    });

    it("appendFocusedAgentVisibleEntityOverlayCommands does not advance sim tick", async () => {
        applySnakeGameConfig({ showFocusedAgentDebug: true });
        resetKineticConstraintIds(5);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        const snakeGame = state.sandbox.snakeGame;
        const snake = spawnSnakeChain(state, { col: 10, row: 10 }, { segmentCount: 4, faction: "red", exportType: "snake" });
        const snakeInstance = registerSnakeTestInstance(state, snakeGame, { headId: snake.chain.head.id, spawnGroupId: snake.chain.spawnGroupId });
        createWiredSnakeAutosim(state, { headId: snake.chain.head.id });
        spawnSnakeChain(state, { col: 14, row: 10 }, { segmentCount: 3, faction: "blue", exportType: "snake" });
        state.followCamera.focus(snakeInstance.head);
        const simTickBefore = snakeGame.simTick;
        const out = [];
        appendFocusedAgentVisibleEntityOverlayCommands(out, state, snakeGame);
        assert.equal(snakeGame.simTick, simTickBefore);
        assert.ok(out.every((cmd) => cmd.kind === "circleFillStroke"));
        assert.ok(out.every((cmd) => cmd.kind !== "aabb"));
    });

    it("launch appendOverlayCommands emits path and target ring only when enabled", async () => {
        applySnakeGameConfig({ showFocusedAgentDebug: true });
        resetKineticConstraintIds(3);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        const snakeGame = state.sandbox.snakeGame;
        const snake = spawnSnakeChain(state, { col: 10, row: 10 }, { segmentCount: 4, faction: "red", exportType: "snake" });
        const snakeInstance = registerSnakeTestInstance(state, snakeGame, { headId: snake.chain.head.id, spawnGroupId: snake.chain.spawnGroupId });
        createWiredSnakeAutosim(state, { headId: snake.chain.head.id });
        state.followCamera.focus(snakeInstance.head);
        const commands = [];
        const instance = snakeGame.instancesByHeadId.get(state.followCamera.targetProp.id);
        appendFocusedAgentVisibleEntityOverlayCommands(commands, state, snakeGame);
        const pathOverlay = instance.autosim.getPathOverlay?.();
        if (pathOverlay) appendFocusedAgentPathPreviewCommands(commands, pathOverlay, instance.head.radius);
        appendFocusedAgentTargetOverlayCommands(commands, state, snakeGame);
        assert.ok(commands.every((cmd) => cmd.kind === "polyline" || cmd.kind === "circleFillStroke" || commands.length === 0));
        assert.ok(commands.every((cmd) => cmd.kind !== "aabb"));
    });
});
