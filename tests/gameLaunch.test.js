import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseGameLaunchQuery } from "../Libraries/Game/parseGameLaunchQuery.js";
import { GAME_LAUNCHERS, getGameLauncher } from "../Libraries/Game/gameLaunchers.js";
describe("parseGameLaunchQuery", () => {
    it("returns null when game param is absent", () => {
        assert.equal(parseGameLaunchQuery(""), null);
        assert.equal(parseGameLaunchQuery("?foo=1"), null);
    });
    it("returns the game id from the query string", () => {
        assert.equal(parseGameLaunchQuery("?game=puzzle"), "puzzle");
        assert.equal(parseGameLaunchQuery("?game=snake"), "snake");
    });
});
describe("game launchers", () => {
    it("registers puzzle with expected start actions", () => {
        const launcher = getGameLauncher("puzzle");
        assert.equal(launcher.title, "Puzzle");
        assert.equal(launcher.hideEditor, true);
        assert.deepEqual(launcher.actions, ["stampBeltCratePuzzle", "focusBlueBall", "snapCameraToTarget", "fitPlayViewport"]);
    });
    it("registers snake with expected start actions", () => {
        const launcher = getGameLauncher("snake");
        assert.equal(launcher.title, "Snake");
        assert.equal(launcher.hideEditor, true);
        assert.equal(launcher.portraitOnly, false);
        assert.deepEqual(launcher.actions, ["loadSnakePlayScene", "focusChainHead", "snapCameraToTarget", "fitPlayViewport"]);
    });
    it("throws for unknown ids", () => {
        assert.throws(() => getGameLauncher("missing"), /Unknown game launch id/);
    });
    it("includes puzzle in the registry map", () => {
        assert.ok(GAME_LAUNCHERS.puzzle);
    });
    it("includes snake in the registry map", () => {
        assert.ok(GAME_LAUNCHERS.snake);
    });
});
