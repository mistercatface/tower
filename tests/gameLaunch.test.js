import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseGameLaunchQuery, GAME_LAUNCHERS } from "../Libraries/Game/gameLaunch.js";

describe("parseGameLaunchQuery", () => {
    it("returns null when game param is absent", () => {
        assert.equal(parseGameLaunchQuery(""), null);
        assert.equal(parseGameLaunchQuery("?foo=1"), null);
    });
    it("returns the game id from the query string", () => {
        assert.equal(parseGameLaunchQuery("?game=snake"), "snake");
    });
});

describe("game launchers", () => {
    it("registers snake launcher configuration", () => {
        const launcher = GAME_LAUNCHERS.snake;
        assert.equal(launcher.title, "Snake");
        assert.equal(launcher.hideEditor, false);
        assert.equal(launcher.actions, undefined);
    });
});
