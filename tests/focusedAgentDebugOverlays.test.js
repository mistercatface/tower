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
import { resolveFocusedAgentDebugContext } from "../Libraries/Game/snake/resolveFocusedAgentDebugContext.js";
import { appendSnakeGameOverlayCommands } from "../Libraries/Game/snake/appendSnakeGameOverlayCommands.js";
import { appendFocusedAgentPathPreviewCommands } from "../Libraries/Game/snake/focusedAgentPathOverlays.js";

describe("focused agent path overlay", () => {
    it("resolveFocusedAgentDebugContext exposes path overlay for snake autosim and flee instance", async () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(1);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        const snakeGame = state.sandbox.snakeGame;
        const snake = spawnSnakeChain(state, { col: 10, row: 10 }, { segmentCount: 4, faction: "red", exportType: "snake" });
        registerSnakeTestInstance(state, snakeGame, { headId: snake.chain.head.id, spawnGroupId: snake.chain.spawnGroupId });
        createWiredSnakeAutosim(state, { headId: snake.chain.head.id, behaviorById: new Map() });
        const fleePack = spawnFleeAgent(state, { col: 12, row: 10 });
        const fleeInstance = createAgentInstance(state, { profileId: AGENT_PROFILE.flee, headId: fleePack.head.id, spawnGroupId: fleePack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", fleeInstance);
        fleeInstance.start(state);

        const snakeCtx = resolveFocusedAgentDebugContext(state, snake.chain.head.id);
        const fleeCtx = resolveFocusedAgentDebugContext(state, fleePack.head.id);
        assert.equal(snakeCtx.species, "snake");
        assert.equal(fleeCtx.species, "flee_agent");
        assert.equal(typeof snakeCtx.getPathOverlay, "function");
        assert.equal(typeof fleeCtx.getPathOverlay, "function");
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

    it("appendSnakeGameOverlayCommands emits path preview only when enabled", async () => {
        applySnakeGameConfig({ showFocusedAgentDebug: true });
        resetKineticConstraintIds(3);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        const snakeGame = state.sandbox.snakeGame;
        const snake = spawnSnakeChain(state, { col: 10, row: 10 }, { segmentCount: 4, faction: "red", exportType: "snake" });
        registerSnakeTestInstance(state, snakeGame, { headId: snake.chain.head.id, spawnGroupId: snake.chain.spawnGroupId });
        createWiredSnakeAutosim(state, { headId: snake.chain.head.id, behaviorById: new Map() });
        const commands = [];
        appendSnakeGameOverlayCommands(commands, state, { focusedHeadId: snake.chain.head.id });
        assert.ok(commands.every((cmd) => cmd.kind === "polyline" || cmd.kind === "circleFillStroke" || commands.length === 0));
    });
});
