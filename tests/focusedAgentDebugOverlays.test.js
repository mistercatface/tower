import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { applySnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { spawnSnakeChain } from "../Libraries/Game/snake/snakeScene.js";
import { spawnFleeAgent } from "../Libraries/Game/snake/spawnAgentChain.js";
import { createAgentInstance } from "../Libraries/Game/snake/AgentInstance.js";
import { AGENT_PROFILE } from "../Libraries/AI/agents/agentProfile.js";
import { registerAgentInstance } from "../Libraries/Game/snake/snakeAgentSession.js";
import { wireSnakeTestGame, registerSnakeTestInstance, createWiredSnakeAutosim, createSnakeGameHarnessState } from "./harness/snakeGameHarness.js";
import { createFocusedAgentDebugContext, appendSnakeGameOverlayCommands } from "../Libraries/Game/snake/appendSnakeGameOverlayCommands.js";
import { appendFocusedAgentPathPreviewCommands } from "../Libraries/Game/snake/focusedAgentPathOverlays.js";
import { appendFocusedAgentTargetOverlayCommands, resolveCommittedTargetWorld } from "../Libraries/Game/snake/focusedAgentTargetOverlays.js";
import { appendFocusedAgentVisibleEntityOverlayCommands } from "../Libraries/Game/snake/focusedAgentVisibleEntityOverlays.js";
describe("focused agent debug overlays", () => {
    it("createFocusedAgentDebugContext exposes path overlay for snake autosim and flee instance", async () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(1);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        const snakeGame = state.sandbox.snakeGame;
        const snake = spawnSnakeChain(state, { col: 10, row: 10 }, { segmentCount: 4, faction: "red", exportType: "snake" });
        const snakeInstance = registerSnakeTestInstance(state, snakeGame, { headId: snake.chain.head.id, spawnGroupId: snake.chain.spawnGroupId });
        createWiredSnakeAutosim(state, { headId: snake.chain.head.id, behaviorById: new Map() });
        const fleePack = spawnFleeAgent(state, { col: 12, row: 10 });
        const fleeInstance = createAgentInstance(state, { profileId: AGENT_PROFILE.flee, head: fleePack.head, spawnGroupId: fleePack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", fleeInstance);
        fleeInstance.start(state);
        const snakeCtx = createFocusedAgentDebugContext(snakeInstance, snakeGame);
        const fleeCtx = createFocusedAgentDebugContext(fleeInstance, snakeGame);
        assert.equal(snakeCtx.instance.profileId, "snake");
        assert.equal(fleeCtx.instance.profileId, AGENT_PROFILE.flee);
        assert.equal(typeof snakeCtx.instance.autosim.getPathOverlay, "function");
        assert.equal(typeof fleeCtx.instance.autosim.getPathOverlay, "function");
    });
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
        const autosim = createWiredSnakeAutosim(state, { headId: snake.chain.head.id, behaviorById: new Map() });
        autosim.start();
        const prey = spawnSnakeChain(state, { col: 14, row: 10 }, { segmentCount: 3, faction: "blue", exportType: "snake" });
        registerSnakeTestInstance(state, snakeGame, { headId: prey.chain.head.id, spawnGroupId: prey.chain.spawnGroupId });
        const ctx = createFocusedAgentDebugContext(snakeInstance, snakeGame);
        const target = resolveCommittedTargetWorld(state, { mode: "seek_prey", targetId: prey.chain.head.id, destination: autosim.getDestination() });
        assert.equal(target?.kind, "entity");
        snakeInstance.intent = { getMode: () => "seek_prey", getTargetId: () => prey.chain.head.id, getDestination: () => null };
        const out = [];
        appendFocusedAgentTargetOverlayCommands(out, state, ctx);
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
        createWiredSnakeAutosim(state, { headId: snake.chain.head.id, behaviorById: new Map() });
        spawnSnakeChain(state, { col: 14, row: 10 }, { segmentCount: 3, faction: "blue", exportType: "snake" });
        const ctx = createFocusedAgentDebugContext(snakeInstance, snakeGame);
        const simTickBefore = snakeGame.simTick;
        const out = [];
        appendFocusedAgentVisibleEntityOverlayCommands(out, state, ctx);
        assert.equal(snakeGame.simTick, simTickBefore);
        assert.ok(out.every((cmd) => cmd.kind === "circleFillStroke"));
        assert.ok(out.every((cmd) => cmd.kind !== "aabb"));
    });
    it("appendSnakeGameOverlayCommands emits path and target ring only when enabled", async () => {
        applySnakeGameConfig({ showFocusedAgentDebug: true });
        resetKineticConstraintIds(3);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        const snakeGame = state.sandbox.snakeGame;
        const snake = spawnSnakeChain(state, { col: 10, row: 10 }, { segmentCount: 4, faction: "red", exportType: "snake" });
        const snakeInstance = registerSnakeTestInstance(state, snakeGame, { headId: snake.chain.head.id, spawnGroupId: snake.chain.spawnGroupId });
        createWiredSnakeAutosim(state, { headId: snake.chain.head.id, behaviorById: new Map() });
        const commands = [];
        appendSnakeGameOverlayCommands(commands, state, { focusedInstance: snakeInstance });
        assert.ok(commands.every((cmd) => cmd.kind === "polyline" || cmd.kind === "circleFillStroke" || commands.length === 0));
        assert.ok(commands.every((cmd) => cmd.kind !== "aabb"));
    });
});
