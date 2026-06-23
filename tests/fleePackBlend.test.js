import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { applySnakeGameConfig, getSnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { pickFleeCell } from "../Libraries/AI/steering/pickFleeCell.js";
import { resolveFleePackOptions } from "../Libraries/Game/snake/fleeAgent/resolveFleePackOptions.js";
import { buildAgentDecisionFrameFor, AGENT_DECISION_PROFILE } from "../Libraries/AI/agents/gameDecisionContext.js";
import { registerAgentInstance } from "../Libraries/Game/snake/snakeAgentSession.js";
import { spawnFleeAgent } from "../Libraries/Game/snake/fleeAgent/spawnFleeAgent.js";
import { createFleeAgentInstance } from "../Libraries/Game/snake/fleeAgent/FleeAgentInstance.js";
import { spawnSnakeChain } from "../Libraries/Game/snake/snakeScene.js";
import { createSnakeGameHarnessState, wireSnakeTestGame, registerSnakeTestInstance, primeSnakeHeadVision } from "./harness/snakeGameHarness.js";

const openNav = { has: () => true };

describe("flee pack blend (4d)", () => {
    it("resolveFleePackOptions returns null without allies", () => {
        applySnakeGameConfig({ fleeAgent: { factionCohesion: { fleePackBlend: 0.35 } } });
        const bb = buildAgentDecisionFrameFor(AGENT_DECISION_PROFILE.snake, { visibleWorld: { threat: { id: 1 }, allyCount: 0 } });
        assert.equal(resolveFleePackOptions(bb), null);
    });

    it("resolveFleePackOptions uses ally centroid when allies are known", () => {
        applySnakeGameConfig({ fleeAgent: { factionCohesion: { fleePackBlend: 0.35, maxPackDistCells: 16 } } });
        const bb = buildAgentDecisionFrameFor(AGENT_DECISION_PROFILE.snake, {
            visibleWorld: { ally: { id: 2, x: 80, y: 40 }, allyCount: 1, allyCentroid: { x: 80, y: 40 } },
        });
        assert.deepEqual(resolveFleePackOptions(bb), { packAnchor: { x: 80, y: 40 }, packBlend: 0.35, maxPackDistCells: 16 });
    });

    it("pickFleeCell biases toward pack anchor while still fleeing the threat", () => {
        applySnakeGameConfig({ fleeTiles: 8 });
        const grid = {
            worldToGrid: (x, y) => ({ col: Math.floor(x / 16), row: Math.floor(y / 16) }),
            worldCol: (x) => Math.floor(x / 16),
            worldRow: (y) => Math.floor(y / 16),
        };
        const self = { x: 10 * 16 + 8, y: 10 * 16 + 8 };
        const threat = { x: 14 * 16 + 8, y: 10 * 16 + 8 };
        const pure = pickFleeCell(self, threat, grid, openNav, 8);
        const packed = pickFleeCell(self, threat, grid, openNav, 8, null, {
            packAnchor: { x: 10 * 16 + 8, y: 6 * 16 + 8 },
            packBlend: 0.5,
            maxPackDistCells: 32,
        });
        assert.ok(pure);
        assert.ok(packed);
        assert.ok(packed.col < grid.worldToGrid(threat.x, threat.y).col, "still flees away from threat on X");
        assert.ok(packed.row < pure.row, "pack blend pulls toward ally to the north");
    });

    it("flee agent uses pack blend when allies are visible during flee", async () => {
        resetKineticConstraintIds(50);
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        applySnakeGameConfig({
            startRadius: 2,
            fleeTiles: 8,
            fleeAgent: { factionCohesion: { fleePackBlend: 0.5, maxPackDistCells: 24 } },
        });
        const fleePack = spawnFleeAgent(state, { col: 10, row: 10 }, { faction: "bravo" });
        const allyPack = spawnFleeAgent(state, { col: 10, row: 6 }, { faction: "bravo" });
        const instance = createFleeAgentInstance(state, { headId: fleePack.head.id, spawnGroupId: fleePack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", instance);
        registerAgentInstance(snakeGame, "flee_agent", createFleeAgentInstance(state, { headId: allyPack.head.id, spawnGroupId: allyPack.spawnGroupId }));
        instance.start(state);
        const predator = spawnSnakeChain(state, { col: 14, row: 10 }, { segmentCount: 6, spacing: 12, segmentRadius: 2, linkSlack: 0.1, faction: "snake", exportType: "snake" });
        registerSnakeTestInstance(state, snakeGame, { headId: predator.chain.head.id, spawnGroupId: predator.chain.spawnGroupId });
        fleePack.head.facing = 0;
        allyPack.head.x = fleePack.head.x;
        allyPack.head.y = fleePack.head.y - 64;
        predator.chain.head.x = fleePack.head.x + 64;
        predator.chain.head.y = fleePack.head.y;
        primeSnakeHeadVision(state, fleePack.head, getSnakeGameConfig().visionRange);
        instance.tick(state, 16);
        assert.equal(instance.intent.getMode(), "flee");
        const snapshot = instance.intent.getDecisionContext();
        assert.ok((snapshot.allyState?.count ?? 0) >= 1);
        const packOptions = resolveFleePackOptions({
            known: {
                ally: snapshot.allyState.ally,
                allyCount: snapshot.allyState.count,
                allyCentroid: snapshot.allyState.centroid,
            },
        });
        assert.ok(packOptions);
        assert.equal(packOptions.packBlend, 0.5);
        assert.ok(instance.intent.getDestination());
    });
});
