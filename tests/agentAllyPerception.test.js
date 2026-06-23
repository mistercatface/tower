import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSegmentSpacing } from "../Libraries/Game/snake/snakeGameConfig.js";
import { spawnLinkedBallChain } from "../Libraries/Sandbox/spawnLinkedBallChain.js";
import { publishAgentEngagement } from "../Libraries/AI/agents/agentEngagement.js";
import { createSnakeGameHarnessState, wireSnakeTestGame, primeSnakeHeadVision, createWiredSnakeAutosim } from "./harness/snakeGameHarness.js";

function chainOptions(segmentCount) {
    const config = getSnakeGameConfig();
    return {
        segmentCount,
        spacing: resolveSnakeSegmentSpacing(config, config.startRadius),
        segmentRadius: config.startRadius,
        linkSlack: config.linkSlack,
        ballType: config.segmentPropId,
        headBallType: config.headPropId,
        growDirX: config.growDirX,
        growDirY: config.growDirY,
    };
}

describe("ally perception integration", () => {
    it("satisfied snake regroups toward a foraging ally via autosim", async () => {
        applySnakeGameConfig({ fleeRange: 128, startRadius: 2 });
        resetKineticConstraintIds(1);
        const { state } = await createSnakeGameHarnessState();
        const seeker = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(3));
        const ally = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(3));
        const { snakeGame } = wireSnakeTestGame(state, [
            { headId: seeker.head.id, spawnGroupId: seeker.spawnGroupId },
            { headId: ally.head.id, spawnGroupId: ally.spawnGroupId },
        ]);
        seeker.head.faction = "red";
        ally.head.faction = "red";
        publishAgentEngagement(snakeGame, ally.head.id, { active: true, salience: ["food"], mode: "seek_food" });
        const autosim = createWiredSnakeAutosim(state, { headId: seeker.head.id, initialFoodFraction: 0.9 });
        seeker.head.facing = 0;
        ally.head.x = seeker.head.x + 64;
        ally.head.y = seeker.head.y;
        primeSnakeHeadVision(state, seeker.head);
        autosim.start();
        autosim.tick(16);
        assert.equal(autosim.getMode(), "seek_ally");
        assert.equal(autosim.getTargetId(), ally.head.id);
    });
});
