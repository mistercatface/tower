import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getChainMemberIds } from "../Libraries/Sandbox/chainLinks.js";
import { getSnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { buildSnakeGameSession, createSnakeGameHarnessState } from "./harness/snakeGameHarness.js";

describe("snakeGameHarness", () => {
    it("builds an active snake session with head, goal, and tick", async () => {
        const { state } = createSnakeGameHarnessState();
        const session = await buildSnakeGameSession(state);
        assert.ok(session.head);
        assert.ok(session.goal);
        assert.equal(typeof session.tick, "function");
        assert.equal(getChainMemberIds(state, session.head.id).length, getSnakeGameConfig().segmentCount);
        session.head.x = session.goal.x;
        session.head.y = session.goal.y;
        session.tick(1 / 60);
        assert.equal(getChainMemberIds(state, session.head.id).length, getSnakeGameConfig().segmentCount + 1);
        session.stop();
    });
});
