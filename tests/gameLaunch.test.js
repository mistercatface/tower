import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseGameLaunchQuery } from "../Libraries/Game/parseGameLaunchQuery.js";
import { GAME_LAUNCHERS } from "../Libraries/Game/gameLaunchers.js";

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
        const launcher = GAME_LAUNCHERS.puzzle;
        assert.equal(launcher.title, "Puzzle");
        assert.equal(launcher.hideEditor, true);
        assert.deepEqual(launcher.actions, ["stampBeltCratePuzzle", "focusBlueBall", "snapCameraToTarget", "fitPlayViewport"]);
    });
    it("registers snake with setup hook and fit viewport action", () => {
        const launcher = GAME_LAUNCHERS.snake;
        assert.equal(launcher.title, "Snake");
        assert.equal(launcher.hideEditor, true);
        assert.equal(launcher.portraitOnly, false);
        assert.equal(typeof launcher.setup, "function");
        assert.deepEqual(launcher.actions, ["fitPlayViewport"]);
    });
});
