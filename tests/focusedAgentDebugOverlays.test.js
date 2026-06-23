import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { applySnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { spawnSnakeChain } from "../Libraries/Game/snake/snakeScene.js";
import { spawnFleeAgent } from "../Libraries/Game/snake/fleeAgent/spawnFleeAgent.js";
import { createFleeAgentInstance } from "../Libraries/Game/snake/fleeAgent/FleeAgentInstance.js";
import { registerAgentInstance } from "../Libraries/Game/snake/snakeAgentSession.js";
import { wireSnakeTestGame, registerSnakeTestInstance, createWiredSnakeAutosim } from "./harness/snakeGameHarness.js";
import { resolveFocusedAgentDebugContext } from "../Libraries/Game/snake/resolveFocusedAgentDebugContext.js";
import { appendSnakeGameOverlayCommands } from "../Libraries/Game/snake/appendSnakeGameOverlayCommands.js";
import { appendFocusedAgentVisionOverlayCommands } from "../Libraries/Game/snake/focusedAgentVisionOverlays.js";
import { appendFocusedAgentPathPreviewCommands } from "../Libraries/Game/snake/focusedAgentPathOverlays.js";
import { appendFocusedAgentTargetOverlayCommands, resolveCommittedTargetWorld } from "../Libraries/Game/snake/focusedAgentTargetOverlays.js";
import { resetVisionFullBuildCount, getVisionFullBuildCount } from "../Libraries/Navigation/perception/observerVisionFrame.js";
import { beginSnakePerceptionFrame } from "../Libraries/Game/snake/snakePerception.js";
import { createSnakeGameHarnessState } from "./harness/snakeGameHarness.js";

describe("focused agent debug overlays", () => {
    it("resolveFocusedAgentDebugContext exposes brain and path for snake autosim and flee instance", async () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(1);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        const snakeGame = state.sandbox.snakeGame;
        const snake = spawnSnakeChain(state, { col: 10, row: 10 }, { segmentCount: 4, faction: "red", exportType: "snake" });
        registerSnakeTestInstance(state, snakeGame, { headId: snake.chain.head.id, spawnGroupId: snake.chain.spawnGroupId });
        createWiredSnakeAutosim(state, { headId: snake.chain.head.id, behaviorById: new Map() });
        const fleePack = spawnFleeAgent(state, { col: 12, row: 10 });
        const fleeInstance = createFleeAgentInstance(state, { headId: fleePack.head.id, spawnGroupId: fleePack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", fleeInstance);
        fleeInstance.start(state);

        const snakeCtx = resolveFocusedAgentDebugContext(state, snake.chain.head.id);
        const fleeCtx = resolveFocusedAgentDebugContext(state, fleePack.head.id);
        assert.equal(snakeCtx.species, "snake");
        assert.equal(fleeCtx.species, "flee_agent");
        assert.ok(snakeCtx.getBrain()?.spatial);
        assert.ok(fleeCtx.getBrain()?.spatial);
        assert.equal(typeof snakeCtx.getPathOverlay, "function");
        assert.equal(typeof fleeCtx.getPathOverlay, "function");
        assert.equal(typeof snakeCtx.getIntentTarget, "function");
    });

    it("appendFocusedAgentPathPreviewCommands draws at most three scaled nodes", () => {
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
        assert.ok(out.every((cmd) => cmd.kind !== "arrowHead"));
    });

    it("appendFocusedAgentTargetOverlayCommands marks committed entity target in red", async () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(4);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        const snakeGame = state.sandbox.snakeGame;
        const snake = spawnSnakeChain(state, { col: 10, row: 10 }, { segmentCount: 4, faction: "red", exportType: "snake" });
        registerSnakeTestInstance(state, snakeGame, { headId: snake.chain.head.id, spawnGroupId: snake.chain.spawnGroupId });
        createWiredSnakeAutosim(state, { headId: snake.chain.head.id, behaviorById: new Map() });
        const autosim = snakeGame.autosimsByHeadId.get(snake.chain.head.id);
        autosim.start();
        const prey = spawnSnakeChain(state, { col: 14, row: 10 }, { segmentCount: 3, faction: "blue", exportType: "snake" });
        registerSnakeTestInstance(state, snakeGame, { headId: prey.chain.head.id, spawnGroupId: prey.chain.spawnGroupId });
        const ctx = resolveFocusedAgentDebugContext(state, snake.chain.head.id);
        const target = resolveCommittedTargetWorld(state, {
            mode: "seek_prey",
            targetId: prey.chain.head.id,
            destination: autosim.getDestination(),
        });
        assert.equal(target?.kind, "entity");
        const out = [];
        appendFocusedAgentTargetOverlayCommands(out, state, {
            ...ctx,
            getIntentTarget: () => ({ mode: "seek_prey", targetId: prey.chain.head.id, destination: null }),
        });
        assert.equal(out.length, 1);
        assert.match(out[0].stroke, /255,\s*80,\s*80/);
    });

    it("appendFocusedAgentVisionOverlayCommands reuses cached vision cache for repeated draws", async () => {
        applySnakeGameConfig({ showFocusedAgentDebug: true });
        resetKineticConstraintIds(2);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        const snakeGame = state.sandbox.snakeGame;
        const snake = spawnSnakeChain(state, { col: 10, row: 10 }, { segmentCount: 4, faction: "red", exportType: "snake" });
        registerSnakeTestInstance(state, snakeGame, { headId: snake.chain.head.id, spawnGroupId: snake.chain.spawnGroupId });
        createWiredSnakeAutosim(state, { headId: snake.chain.head.id, behaviorById: new Map() });
        const ctx = resolveFocusedAgentDebugContext(state, snake.chain.head.id);
        beginSnakePerceptionFrame(state);
        resetVisionFullBuildCount();
        const outA = [];
        appendFocusedAgentVisionOverlayCommands(outA, state, ctx);
        const buildsAfterFirst = getVisionFullBuildCount();
        const outB = [];
        appendFocusedAgentVisionOverlayCommands(outB, state, ctx);
        assert.equal(getVisionFullBuildCount(), buildsAfterFirst);
        assert.ok(outA.some((cmd) => cmd.kind === "aabb"));
    });

    it("appendSnakeGameOverlayCommands emits vision, memory, and path commands for focused head", async () => {
        applySnakeGameConfig({ showFocusedAgentDebug: true, focusedAgentDebug: { vision: true, spatialMemory: true, path: true } });
        resetKineticConstraintIds(3);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        const snakeGame = state.sandbox.snakeGame;
        const snake = spawnSnakeChain(state, { col: 10, row: 10 }, { segmentCount: 4, faction: "red", exportType: "snake" });
        registerSnakeTestInstance(state, snakeGame, { headId: snake.chain.head.id, spawnGroupId: snake.chain.spawnGroupId });
        createWiredSnakeAutosim(state, { headId: snake.chain.head.id, behaviorById: new Map() });
        beginSnakePerceptionFrame(state);
        const commands = [];
        appendSnakeGameOverlayCommands(commands, state, { focusedHeadId: snake.chain.head.id });
        assert.ok(commands.some((cmd) => cmd.kind === "aabb"));
        const hasPath = commands.some((cmd) => cmd.kind === "polyline" || cmd.kind === "segment" || cmd.kind === "circleStroke" || cmd.kind === "arrowHead");
        const hasMemory = commands.filter((cmd) => cmd.kind === "aabb").length > 1;
        assert.ok(hasMemory || hasPath, "expected spatial memory cells and/or path overlay commands");
    });
});
