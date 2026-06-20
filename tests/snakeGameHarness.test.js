import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getChainMemberIds } from "../Libraries/Sandbox/chainLinks.js";
import { getSnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { buildSnakeGameSession, createSnakeGameHarnessState } from "./harness/snakeGameHarness.js";
import { FRAME_MS } from "./frameMs.js";
describe("snakeGameHarness", () => {
    it("builds an active snake session with head, goal, and tick", async () => {
        const { state } = await createSnakeGameHarnessState();
        const session = await buildSnakeGameSession(state);
        assert.ok(session.cameraTarget);
        assert.ok(session.goal);
        assert.equal(typeof session.tick, "function");
        assert.equal(getChainMemberIds(state, session.cameraTarget.id).length, getSnakeGameConfig().segmentCount);
        session.cameraTarget.x = session.goal.x;
        session.cameraTarget.y = session.goal.y;
        session.tick(FRAME_MS);
        assert.equal(getChainMemberIds(state, session.cameraTarget.id).length, getSnakeGameConfig().segmentCount + 1);
        session.stop();
    });
});
